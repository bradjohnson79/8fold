/**
 * Server-side onboarding enforcement guards.
 * Ensures Terms + Profile (or wizard) are complete before dashboard/role API access.
 * Returns structured `ready:false` JSON on incomplete onboarding (HTTP 200). Does not throw.
 */
import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { auditLogs } from "../../db/schema/auditLog";
import { contractorAccounts } from "../../db/schema/contractorAccount";
import { jobPosterProfiles } from "../../db/schema/jobPosterProfile";
import { requireContractor, requireJobPoster } from "./rbac";
import type { ApiAuthedUser } from "./rbac";
import { toHttpError } from "../http/errors";
import { incCounter } from "../server/observability/metrics";
import { logEvent } from "../server/observability/log";

const JOB_POSTER_TOS_VERSION = "1.0";

type OnboardingNotReadyState = {
  ok: true;
  ready: false;
  code: "ONBOARDING_INCOMPLETE";
  role: "JOB_POSTER" | "ROUTER" | "CONTRACTOR";
  onboardingRoute: string;
  // Job poster specific
  acceptedCurrent?: boolean;
  profileComplete?: boolean;
  missingFields?: string[];
  // Router specific
  termsAccepted?: boolean;
  profileCompleteRouter?: boolean;
  // Contractor specific
  wizardCompleted?: boolean;
};

function onboardingNotReady(state: OnboardingNotReadyState, context: Record<string, unknown>) {
  incCounter("onboarding_block_total", {
    role: String((context as any)?.role ?? "unknown"),
    route: (() => {
      const raw = (context as any)?.route;
      return typeof raw === "string" ? raw : undefined;
    })(),
    reason: Array.isArray((context as any)?.missing) ? String(((context as any).missing as any[])[0] ?? "missing") : undefined,
  });
  logEvent({
    level: "warn",
    event: "onboarding.blocked",
    route: typeof (context as any)?.route === "string" ? (context as any).route : undefined,
    method: typeof (context as any)?.method === "string" ? (context as any).method : undefined,
    status: 200,
    userId: typeof (context as any)?.userId === "string" ? (context as any).userId : undefined,
    role: typeof (context as any)?.role === "string" ? (context as any).role : undefined,
    code: "ONBOARDING_INCOMPLETE",
    context,
  });
  return NextResponse.json({ ...state, context }, { status: 200 });
}

/**
 * Job Poster: terms (auditLogs) + profile (jobPosterProfiles address/city/state/country).
 * Use for: create-draft, drafts/save, payment-intent, job publish, dashboard data.
 * Exclude: job-poster-tos, job-poster/profile (used to complete onboarding).
 */
export async function requireJobPosterReady(
  req: Request
): Promise<ApiAuthedUser | NextResponse> {
  let user: ApiAuthedUser;
  try {
    user = await requireJobPoster(req);
  } catch (err) {
    const { status, message, code, context } = toHttpError(err);
    return NextResponse.json({ ok: false, error: message, code, context }, { status });
  }

  const route = new URL(req.url).pathname;
  const method = req.method;

  // 1. Terms: JOB_POSTER_TOS_ACCEPTED in auditLogs with current version
  const tosRows = await db
    .select({ metadata: auditLogs.metadata })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.action, "JOB_POSTER_TOS_ACCEPTED"),
        eq(auditLogs.entityType, "User"),
        eq(auditLogs.entityId, user.userId),
        eq(auditLogs.actorUserId, user.userId)
      )
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(1);
  const tosLatest = tosRows[0] ?? null;
  const tosMeta = (tosLatest?.metadata ?? null) as { version?: string } | null;
  const acceptedCurrent = tosMeta?.version === JOB_POSTER_TOS_VERSION;

  // 2. Profile: full address (address, city, stateProvince, country)
  const profileRows = await db
    .select({
      address: jobPosterProfiles.address,
      city: jobPosterProfiles.city,
      stateProvince: jobPosterProfiles.stateProvince,
      country: jobPosterProfiles.country,
    })
    .from(jobPosterProfiles)
    .where(eq(jobPosterProfiles.userId, user.userId))
    .limit(1);
  const profile = profileRows[0] ?? null;
  const profileComplete = Boolean(
    profile &&
      (profile.address ?? "").trim() &&
      (profile.city ?? "").trim() &&
      (profile.stateProvince ?? "").trim() &&
      String(profile.country ?? "").trim()
  );
  const missingFields = [
    !String(profile?.address ?? "").trim() ? "address" : null,
    !String(profile?.city ?? "").trim() ? "city" : null,
    !String(profile?.stateProvince ?? "").trim() ? "stateProvince" : null,
    !String(profile?.country ?? "").trim() ? "country" : null,
  ].filter(Boolean) as string[];

  const ready = acceptedCurrent && profileComplete;
  if (!ready) {
    return onboardingNotReady(
      {
        ok: true,
        ready: false,
        code: "ONBOARDING_INCOMPLETE",
        role: "JOB_POSTER",
        onboardingRoute: "/app/job-poster/onboarding",
        acceptedCurrent,
        profileComplete,
        missingFields,
      },
      {
        role: "JOB_POSTER",
        userId: user.userId,
        route,
        method,
        missing: [
          !acceptedCurrent ? "TOS" : null,
          !profileComplete ? "PROFILE" : null,
        ].filter(Boolean),
        missingFields,
        acceptedCurrent,
        profileComplete,
      },
    );
  }

  return user;
}

/**
 * Contractor: wizardCompleted on contractor_accounts (includes waiver + profile).
 * Use for: dispatch respond, offers, conversations, routed jobs, dashboard.
 * Exclude: contractor-waiver, contractor/profile (used to complete onboarding).
 */
export async function requireContractorReady(
  req: Request
): Promise<ApiAuthedUser | NextResponse> {
  let user: ApiAuthedUser;
  try {
    user = await requireContractor(req);
  } catch (err) {
    const { status, message, code, context } = toHttpError(err);
    return NextResponse.json({ ok: false, error: message, code, context }, { status });
  }

  const route = new URL(req.url).pathname;
  const method = req.method;

  const acctRows = await db
    .select({ wizardCompleted: contractorAccounts.wizardCompleted })
    .from(contractorAccounts)
    .where(eq(contractorAccounts.userId, user.userId))
    .limit(1);
  const acct = acctRows[0] ?? null;

  const wizardCompleted = Boolean(acct?.wizardCompleted);
  const ready = Boolean(acct) && wizardCompleted;
  if (!ready) {
    return onboardingNotReady(
      {
        ok: true,
        ready: false,
        code: "ONBOARDING_INCOMPLETE",
        role: "CONTRACTOR",
        onboardingRoute: "/app/contractor/profile",
        wizardCompleted,
      },
      {
        role: "CONTRACTOR",
        userId: user.userId,
        route,
        method,
        missing: ["WIZARD"],
        wizardCompleted,
      },
    );
  }

  return user;
}
