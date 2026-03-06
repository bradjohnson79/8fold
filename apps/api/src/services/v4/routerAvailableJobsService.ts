import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { routerProfilesV4 } from "@/db/schema/routerProfileV4";
import { users } from "@/db/schema/user";
import { ROUTING_STATUS } from "@/src/router/routingStatus";
import { expireStaleInvitesAndResetJobs } from "@/src/services/v4/inviteExpirationService";

const TRACE_SERVICE_SOURCE = "apps/api/src/services/v4/routerAvailableJobsService.ts";

export type RouterAvailableJobsTraceOpts = { requestId?: string } | undefined;

function normalizeRegionCode(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeCountryCode(value: string | null | undefined): "US" | "CA" {
  const c = String(value ?? "").trim().toUpperCase();
  return c === "CA" ? "CA" : "US";
}

function traceLog(trace: boolean, msg: string) {
  if (trace) console.log(`[router-trace] ${msg}`);
}

export async function getV4RouterAvailableJobs(userId: string, traceOpts?: RouterAvailableJobsTraceOpts) {
  const trace = process.env.ENABLE_ROUTER_TRACE === "true" && traceOpts != null;

  try {
    if (trace) {
      traceLog(trace, `service_source=${TRACE_SERVICE_SOURCE}`);
      traceLog(trace, `step_pre expireStaleInvitesAndResetJobs`);
    }

    try {
      await expireStaleInvitesAndResetJobs();
    } catch (expireErr) {
      console.error("[available-jobs] expireStaleInvitesAndResetJobs failed (non-fatal)", expireErr instanceof Error ? expireErr.message : expireErr);
    }

    if (trace) traceLog(trace, `step_post expireStaleInvitesAndResetJobs`);

    // Phase 3 — Service-level DB fingerprint and counts (diagnostic only)
    if (trace) {
      const fpRes = await db.execute<{ current_database: string; server_addr: string; server_port: number; current_schema: string }>(
        sql`SELECT current_database() AS current_database, inet_server_addr()::text AS server_addr, inet_server_port() AS server_port, current_schema() AS current_schema`,
      );
      const fp = (fpRes as { rows?: Array<{ current_database?: string; server_addr?: string; server_port?: number; current_schema?: string }> })?.rows?.[0];
      traceLog(trace, `db_fingerprint current_database=${fp?.current_database ?? "?"} server_addr=${fp?.server_addr ?? "?"} server_port=${fp?.server_port ?? "?"} current_schema=${fp?.current_schema ?? "?"}`);

      const jobsCountRes = await db.execute<{ jobs_count: string }>(sql`SELECT COUNT(*)::text AS jobs_count FROM jobs`);
      const jobsCount = (jobsCountRes as { rows?: Array<{ jobs_count?: string }> })?.rows?.[0]?.jobs_count ?? "?";
      traceLog(trace, `jobs_count=${jobsCount}`);

      const profilesCountRes = await db.execute<{ router_profiles_count: string }>(
        sql`SELECT COUNT(*)::text AS router_profiles_count FROM router_profiles_v4`,
      );
      const profilesCount = (profilesCountRes as { rows?: Array<{ router_profiles_count?: string }> })?.rows?.[0]?.router_profiles_count ?? "?";
      traceLog(trace, `router_profiles_count=${profilesCount}`);

      const caBcRes = await db.execute<{ ca_bc_open_jobs: string }>(
        sql`
        SELECT COUNT(*)::text AS ca_bc_open_jobs FROM jobs
        WHERE country_code = 'CA'
          AND upper(trim(coalesce(region_code, state_code, ''))) = 'BC'
          AND archived_at IS NULL
          AND status = 'OPEN_FOR_ROUTING'
          AND routing_status = 'UNROUTED'
          AND contractor_user_id IS NULL
          AND COALESCE(cancel_request_pending, false) = false
        `,
      );
      const caBcCount = (caBcRes as { rows?: Array<{ ca_bc_open_jobs?: string }> })?.rows?.[0]?.ca_bc_open_jobs ?? "?";
      traceLog(trace, `ca_bc_open_jobs=${caBcCount}`);
    }

    // Phase 4 — Auth/profile consistency check
    if (trace) {
      const [userRows, profileRowsAll] = await Promise.all([
        db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, userId)).limit(1),
        db.select().from(routerProfilesV4).where(eq(routerProfilesV4.userId, userId)),
      ]);
      const user = userRows[0] ?? null;
      traceLog(trace, `auth_profile_check: user_exists=${user != null} role=${user?.role ?? "null"}`);
      traceLog(trace, `auth_profile_check: router_profiles_v4_row_count=${profileRowsAll.length}`);
      if (profileRowsAll.length > 1) traceLog(trace, `auth_profile_check: WARNING multiple rows for user`);
      for (const p of profileRowsAll) {
        traceLog(
          trace,
          `auth_profile_check: profile home_country_code=${p.homeCountryCode ?? "null"} home_region_code=${p.homeRegionCode ?? "null"}`,
        );
      }
    }

    const profileRows = await db
      .select({
        countryCode: routerProfilesV4.homeCountryCode,
        regionCode: routerProfilesV4.homeRegionCode,
      })
      .from(routerProfilesV4)
      .where(eq(routerProfilesV4.userId, userId))
      .limit(1);

    const profile = profileRows[0] ?? null;
    const routerCountry = normalizeCountryCode(profile?.countryCode);
    const routerRegionCode = normalizeRegionCode(profile?.regionCode);

    // Step A — Router profile resolution
    if (trace) {
      traceLog(trace, `step_a router_user_id=${userId}`);
      traceLog(trace, `step_a router_profile_found=${profile != null}`);
      traceLog(trace, `step_a homeCountryCode=${profile?.countryCode ?? "null"} homeRegionCode=${profile?.regionCode ?? "null"}`);
      traceLog(trace, `step_a resolved routerCountry=${routerCountry} routerRegionCode=${routerRegionCode}`);
    }

    if (!routerRegionCode || !/^[A-Z]{2}$/.test(routerRegionCode)) {
      if (trace) traceLog(trace, `step_a early_exit: invalid region (empty or not 2 chars)`);
      console.warn(`[available-jobs] early_exit: invalid region userId=${userId} regionCode="${routerRegionCode}" profileFound=${profile != null}`);
      return {
        ok: true as const,
        jobs: [],
        _meta: {
          userId,
          profileFound: profile != null,
          country: routerCountry,
          region: routerRegionCode,
          earlyExit: "invalid_region",
          ts: new Date().toISOString(),
        },
      };
    }

    if (process.env.NODE_ENV !== "production") {
      console.debug(`[router-available-jobs] Router: ${routerCountry} / ${routerRegionCode}`);
    }

    // Step B — Candidate count by filter stage (diagnostic only)
    if (trace) {
      const c1 = await db.execute<{ cnt: string }>(
        sql`
        SELECT COUNT(*)::text AS cnt FROM jobs
        WHERE country_code = ${routerCountry}
          AND upper(trim(coalesce(region_code, state_code, ''))) = ${routerRegionCode}
          AND archived_at IS NULL
        `,
      );
      const c2 = await db.execute<{ cnt: string }>(
        sql`
        SELECT COUNT(*)::text AS cnt FROM jobs
        WHERE country_code = ${routerCountry}
          AND upper(trim(coalesce(region_code, state_code, ''))) = ${routerRegionCode}
          AND archived_at IS NULL
          AND status = 'OPEN_FOR_ROUTING'
        `,
      );
      const c3 = await db.execute<{ cnt: string }>(
        sql`
        SELECT COUNT(*)::text AS cnt FROM jobs
        WHERE country_code = ${routerCountry}
          AND upper(trim(coalesce(region_code, state_code, ''))) = ${routerRegionCode}
          AND archived_at IS NULL
          AND status = 'OPEN_FOR_ROUTING'
          AND routing_status = 'UNROUTED'
        `,
      );
      const c4 = await db.execute<{ cnt: string }>(
        sql`
        SELECT COUNT(*)::text AS cnt FROM jobs
        WHERE country_code = ${routerCountry}
          AND upper(trim(coalesce(region_code, state_code, ''))) = ${routerRegionCode}
          AND archived_at IS NULL
          AND status = 'OPEN_FOR_ROUTING'
          AND routing_status = 'UNROUTED'
          AND contractor_user_id IS NULL
        `,
      );
      const c5 = await db.execute<{ cnt: string }>(
        sql`
        SELECT COUNT(*)::text AS cnt FROM jobs
        WHERE country_code = ${routerCountry}
          AND upper(trim(coalesce(region_code, state_code, ''))) = ${routerRegionCode}
          AND archived_at IS NULL
          AND status = 'OPEN_FOR_ROUTING'
          AND routing_status = 'UNROUTED'
          AND contractor_user_id IS NULL
          AND COALESCE(cancel_request_pending, false) = false
        `,
      );
      const r1 = (c1 as { rows?: { cnt?: string }[] })?.rows?.[0]?.cnt ?? "?";
      const r2 = (c2 as { rows?: { cnt?: string }[] })?.rows?.[0]?.cnt ?? "?";
      const r3 = (c3 as { rows?: { cnt?: string }[] })?.rows?.[0]?.cnt ?? "?";
      const r4 = (c4 as { rows?: { cnt?: string }[] })?.rows?.[0]?.cnt ?? "?";
      const r5 = (c5 as { rows?: { cnt?: string }[] })?.rows?.[0]?.cnt ?? "?";
      traceLog(trace, `step_b filter_stage_1_jurisdiction_only count=${r1}`);
      traceLog(trace, `step_b filter_stage_2_plus_status_OPEN_FOR_ROUTING count=${r2}`);
      traceLog(trace, `step_b filter_stage_3_plus_routing_status_UNROUTED count=${r3}`);
      traceLog(trace, `step_b filter_stage_4_plus_contractor_user_id_NULL count=${r4}`);
      traceLog(trace, `step_b filter_stage_5_plus_cancel_request_pending_false count=${r5}`);
    }

    const raw = await db
      .select({
        id: jobs.id,
        status: jobs.status,
        title: jobs.title,
        scope: jobs.scope,
        city: jobs.city,
        region: jobs.region,
        countryCode: jobs.country_code,
        regionCode: jobs.region_code,
        stateCode: jobs.state_code,
        routingStatus: jobs.routing_status,
        cancelRequestPending: jobs.cancel_request_pending,
        postedAt: jobs.posted_at,
        serviceType: jobs.service_type,
        tradeCategory: jobs.trade_category,
        jobType: jobs.job_type,
        amountCents: jobs.amount_cents,
        totalAmountCents: jobs.total_amount_cents,
        contractorPayoutCents: jobs.contractor_payout_cents,
        routerEarningsCents: jobs.router_earnings_cents,
        brokerFeeCents: jobs.broker_fee_cents,
        laborTotalCents: jobs.labor_total_cents,
        materialsTotalCents: jobs.materials_total_cents,
        transactionFeeCents: jobs.transaction_fee_cents,
        publishedAt: jobs.published_at,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.status, "OPEN_FOR_ROUTING"),
          eq(jobs.routing_status, ROUTING_STATUS.UNROUTED),
          or(eq(jobs.cancel_request_pending, false), isNull(jobs.cancel_request_pending)),
          isNull(jobs.archived_at),
          isNull(jobs.contractor_user_id),
          eq(jobs.country_code, routerCountry),
          sql`upper(trim(coalesce(${jobs.region_code}, ${jobs.state_code}, ''))) = ${routerRegionCode}`,
        ),
      )
      .orderBy(desc(jobs.published_at), desc(jobs.id))
      .limit(50);

    if (process.env.NODE_ENV !== "production") {
      console.debug(`[router-available-jobs] Jobs Returned: ${raw.length}`);
    }

    // Step C — Sample rows
    if (trace && raw.length > 0) {
      const samples = raw.slice(0, 5);
      for (let i = 0; i < samples.length; i++) {
        const j = samples[i] as Record<string, unknown>;
        traceLog(
          trace,
          `step_c sample_${i + 1} id=${j.id} title=${String(j.title ?? "").slice(0, 40)} status=${j.status} routing_status=${j.routingStatus ?? "n/a"} country_code=${j.countryCode} region_code=${j.regionCode} state_code=${j.stateCode} city=${j.city} cancel_request_pending=${j.cancelRequestPending}`,
        );
      }
      traceLog(trace, `step_c final_result_count=${raw.length}`);
    }

    const jobsRes = raw.map((j) => {
      const contractorPayoutCents = Number((j.contractorPayoutCents as any) ?? 0);
      const routerEarningsCents = Number((j.routerEarningsCents as any) ?? 0);
      const brokerFeeCents = Number((j.brokerFeeCents as any) ?? 0);
      const transactionFeeCents = Number((j.transactionFeeCents as any) ?? 0);
      const jobPosterPaysCents = contractorPayoutCents + routerEarningsCents + brokerFeeCents + transactionFeeCents;
      return {
        id: j.id,
        status: j.status,
        title: j.title,
        scope: j.scope,
        city: j.city,
        region: j.region,
        countryCode: j.countryCode,
        regionCode: normalizeRegionCode(j.regionCode ?? j.stateCode),
        provinceCode: normalizeRegionCode(j.regionCode ?? j.stateCode),
        postedAt: j.postedAt ? j.postedAt.toISOString() : "",
        createdAt: j.postedAt ? j.postedAt.toISOString() : "",
        serviceType: j.serviceType,
        tradeCategory: j.tradeCategory,
        jobType: j.jobType,
        urbanOrRegional: j.jobType === "urban" ? "Urban" : "Regional",
        budgetCents: jobPosterPaysCents,
        appraisalTotal:
          Number((j.totalAmountCents as any) ?? 0) > 0
            ? Number((j.totalAmountCents as any) ?? 0)
            : Number((j.amountCents as any) ?? 0) > 0
              ? Number((j.amountCents as any) ?? 0)
              : jobPosterPaysCents,
        laborTotalCents: j.laborTotalCents,
        materialsTotalCents: j.materialsTotalCents,
        transactionFeeCents: j.transactionFeeCents,
        contractorPayoutCents: j.contractorPayoutCents,
        routerEarningsCents: j.routerEarningsCents,
        platformFeeCents: j.brokerFeeCents,
        publishedAt: j.publishedAt ? j.publishedAt.toISOString() : "",
      };
    });

    return {
      ok: true as const,
      jobs: jobsRes,
      _meta: {
        userId,
        profileFound: profile != null,
        country: routerCountry,
        region: routerRegionCode,
        rawCount: raw.length,
        ts: new Date().toISOString(),
      },
    };
  } catch (err) {
    console.error(`[available-jobs] service_error userId=${userId}`, err instanceof Error ? err.message : err);
    return {
      ok: true as const,
      jobs: [],
      _meta: {
        userId,
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      },
    };
  }
}
