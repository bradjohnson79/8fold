import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { and, desc, eq, gte, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractors } from "@/db/schema/contractor";
import { jobAssignments } from "@/db/schema/jobAssignment";
import { jobs } from "@/db/schema/job";
import { jobHolds } from "@/db/schema/jobHold";

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const status = (url.searchParams.get("status") ?? "").trim() || null;
    const q = (url.searchParams.get("q") ?? "").trim();
    const jobSource = url.searchParams.get("jobSource") ?? "";
    const archivedRaw = (url.searchParams.get("archived") ?? "").trim().toLowerCase();
    const country = url.searchParams.get("country") ?? "";
    const state = url.searchParams.get("state") ?? "";
    const city = url.searchParams.get("city") ?? "";
    const dateRange = url.searchParams.get("dateRange") ?? "ALL";
    const tradeCategory = url.searchParams.get("tradeCategory") ?? "";

    // Admin is oversight: allow full lifecycle visibility.
    // Note: "CUSTOMER_APPROVED_AWAITING_ROUTER" and "FLAGGED_HOLD" are UI-level filters
    // that map to DB enums + additional predicates.
    const ADMIN_STATUSES = new Set([
      "DRAFT",
      "OPEN_FOR_ROUTING",
      "ASSIGNED",
      "IN_PROGRESS",
      "CONTRACTOR_COMPLETED",
      "CUSTOMER_APPROVED_AWAITING_ROUTER",
      "CUSTOMER_REJECTED",
      "FLAGGED_HOLD",
    ]);
    if (status && !ADMIN_STATUSES.has(status)) {
      return NextResponse.json({ ok: false, error: `Unsupported status: ${status}` }, { status: 400 });
    }

    const ALLOWED_COUNTRIES = new Set(["CA", "US"]);
    if (country && !ALLOWED_COUNTRIES.has(country)) {
      return NextResponse.json({ ok: false, error: `Invalid country: ${country}` }, { status: 400 });
    }

    const ALLOWED_JOB_SOURCES = new Set(["MOCK", "REAL", "AI_REGENERATED"]);
    if (jobSource && !ALLOWED_JOB_SOURCES.has(jobSource)) {
      return NextResponse.json({ ok: false, error: `Invalid jobSource: ${jobSource}` }, { status: 400 });
    }

    if (archivedRaw && !["true", "false"].includes(archivedRaw)) {
      return NextResponse.json({ ok: false, error: "Invalid archived" }, { status: 400 });
    }

    const ALLOWED_DATE_RANGES = new Set(["1D", "7D", "30D", "90D", "ALL"]);
    if (!ALLOWED_DATE_RANGES.has(dateRange)) {
      return NextResponse.json({ ok: false, error: `Invalid dateRange: ${dateRange}` }, { status: 400 });
    }

    // DB authoritative enum values for TradeCategory (labels are UI-only).
    const ALLOWED_TRADE_CATEGORIES = new Set([
      "PLUMBING",
      "ELECTRICAL",
      "HVAC",
      "APPLIANCE",
      "HANDYMAN",
      "PAINTING",
      "CARPENTRY",
      "DRYWALL",
      "ROOFING",
      "JANITORIAL_CLEANING",
      "LANDSCAPING",
      "FENCING",
      "SNOW_REMOVAL",
      "JUNK_REMOVAL",
      "MOVING",
      "FURNITURE_ASSEMBLY",
      "AUTOMOTIVE",
    ]);
    if (tradeCategory && !ALLOWED_TRADE_CATEGORIES.has(tradeCategory)) {
      return NextResponse.json({ ok: false, error: `Invalid tradeCategory: ${tradeCategory}` }, { status: 400 });
    }

    if (state && state.trim().length > 10) {
      return NextResponse.json({ ok: false, error: "Invalid state" }, { status: 400 });
    }
    if (city && city.trim().length > 100) {
      return NextResponse.json({ ok: false, error: "Invalid city" }, { status: 400 });
    }
    if (q && q.length > 120) {
      return NextResponse.json({ ok: false, error: "Invalid q" }, { status: 400 });
    }

    // Default: show ALL non-archived jobs. If explicitly filtered, allow admin to view archived=true as well.
    const conditions: any[] = [eq(jobs.archived, archivedRaw ? archivedRaw === "true" : false)];

    // Status mapping (only if explicitly requested)
    if (status === "DRAFT") conditions.push(eq(jobs.status, "DRAFT" as any));
    else if (status === "OPEN_FOR_ROUTING") conditions.push(eq(jobs.status, "OPEN_FOR_ROUTING" as any));
    else if (status === "ASSIGNED") conditions.push(eq(jobs.status, "ASSIGNED" as any));
    else if (status === "IN_PROGRESS") conditions.push(eq(jobs.status, "IN_PROGRESS" as any));
    else if (status === "CONTRACTOR_COMPLETED") conditions.push(eq(jobs.status, "CONTRACTOR_COMPLETED" as any));
    else if (status === "CUSTOMER_REJECTED") conditions.push(eq(jobs.status, "CUSTOMER_REJECTED" as any));
    else if (status === "CUSTOMER_APPROVED_AWAITING_ROUTER") {
      conditions.push(eq(jobs.status, "CUSTOMER_APPROVED" as any));
      conditions.push(isNull(jobs.router_approved_at));
    } else if (status === "FLAGGED_HOLD") {
      // Active holds are already filtered in the leftJoin condition.
      // Avoid referencing jobHolds.status in WHERE to prevent SQL instability.
      conditions.push(eq(jobs.status, "COMPLETION_FLAGGED" as any));
    }

    if (country) conditions.push(eq(jobs.country, country as any));
    if (tradeCategory) conditions.push(eq(jobs.trade_category, tradeCategory as any));
    if (jobSource) conditions.push(eq(jobs.job_source, jobSource as any));

    if (state) {
      const s = state.trim().toUpperCase();
      conditions.push(or(eq(jobs.region_code, s), eq(jobs.region, s)));
    }

    if (city) {
      const c = city.trim();
      conditions.push(ilike(jobs.city, `%${c}%`));
    }

    // Full job search (server-side only): match by id (exact) or title/address/city partial.
    if (q) {
      const pat = `%${q}%`;
      conditions.push(
        or(
          eq(jobs.id, q),
          ilike(jobs.title, pat),
          ilike(jobs.address_full, pat),
          ilike(jobs.city, pat),
        ) as any,
      );
    }

    if (dateRange !== "ALL") {
      const days = dateRange === "1D" ? 1 : dateRange === "7D" ? 7 : dateRange === "30D" ? 30 : 90;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      conditions.push(gte(jobs.created_at, since));
    }

    const where = and(...conditions);
    let rows: any[];
    try {
      rows = await db
        .select({
          job: jobs,
          assignment: jobAssignments,
          contractor: contractors,
        })
        .from(jobs)
        .leftJoin(jobHolds, and(eq(jobHolds.jobId, jobs.id), eq(jobHolds.status, "ACTIVE" as any)))
        .leftJoin(jobAssignments, eq(jobAssignments.jobId, jobs.id))
        .leftJoin(contractors, eq(contractors.id, jobAssignments.contractorId))
        .where(where as any)
        .orderBy(desc(jobs.published_at))
        .limit(200);
    } catch (err) {
      // Postgres enum invalid input (e.g. JobStatus / JobSource mismatch) → 400, not a 500.
      const anyErr: any = err && typeof err === "object" ? (err as any) : null;
      const msg = err instanceof Error ? err.message : String(err);
      if (anyErr?.code === "22P02" && /invalid input value for enum/i.test(msg)) {
        return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
      }
      return handleApiError(err, "GET /api/admin/jobs (query)", {
        route: "/api/admin/jobs",
        userId: auth.userId,
      });
    }

    const jobsOut = rows.map((r: any) => ({
      ...(r.job as any),
      assignment: r.assignment?.id
        ? {
            ...(r.assignment as any),
            contractor: r.contractor?.id ? (r.contractor as any) : null,
          }
        : null,
    }));

    return NextResponse.json({ ok: true, data: { jobs: jobsOut } });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/jobs", {
      route: "/api/admin/jobs",
      userId: auth.userId,
      traceId: req.headers.get("x-admin-trace-id") ?? null,
    });
  }
}

