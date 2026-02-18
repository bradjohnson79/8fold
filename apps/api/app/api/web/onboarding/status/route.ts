import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { auditLogs } from "../../../../../db/schema/auditLog";
import { contractorAccounts } from "../../../../../db/schema/contractorAccount";
import { jobPosterProfiles } from "../../../../../db/schema/jobPosterProfile";
import { requireUser } from "../../../../../src/auth/rbac";
import { getRouterSessionData } from "../../../../../src/auth/routerSession";
import { toHttpError } from "../../../../../src/http/errors";

const JOB_POSTER_TOS_VERSION = "1.0";
const CONTRACTOR_WAIVER_VERSION = "1.0";

type Step = {
  ok: boolean;
  currentVersion?: string;
  acceptedCurrent?: boolean;
  acceptedVersion?: string | null;
  acceptedAt?: string | null;
  missingFields?: string[];
  reason?: string;
};

export async function GET(req: Request) {
  try {
    const u = await requireUser(req);
    const role = String(u.role ?? "").trim().toUpperCase();

    // Base shape: always 3 steps (TOS / Profile / Verified)
    const tos: Step = { ok: true };
    const profile: Step = { ok: true };
    const verified: Step = { ok: true };

    // Default UX routes (web app conventions). These are best-effort helpers for UI routing.
    const roleRoot =
      role === "ROUTER"
        ? "/app/router"
        : role === "CONTRACTOR"
          ? "/app/contractor"
          : role === "ADMIN"
            ? "/admin"
            : "/app/job-poster";
    const onboardingRoute =
      role === "ROUTER"
        ? "/app/router"
        : role === "CONTRACTOR"
          ? "/app/contractor/profile"
          : "/app/job-poster/onboarding";

    // Admins have no onboarding gates in the web app.
    if (role === "ADMIN") {
      return NextResponse.json({
        ok: true,
        role,
        roleRoot,
        onboardingRoute,
        steps: { tos, profile, verified },
      });
    }

    // JOB POSTER
    if (role === "JOB_POSTER") {
      const tosRows = await db
        .select({ createdAt: auditLogs.createdAt, metadata: auditLogs.metadata })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.action, "JOB_POSTER_TOS_ACCEPTED"),
            eq(auditLogs.entityType, "User"),
            eq(auditLogs.entityId, u.userId),
            eq(auditLogs.actorUserId, u.userId),
          ),
        )
        .orderBy(desc(auditLogs.createdAt))
        .limit(1);
      const latest = tosRows[0] ?? null;
      const meta = (latest?.metadata ?? null) as any;
      const acceptedVersion = typeof meta?.version === "string" ? meta.version : null;
      const acceptedAt = typeof meta?.acceptedAt === "string" ? meta.acceptedAt : null;
      const acceptedCurrent = acceptedVersion === JOB_POSTER_TOS_VERSION;
      tos.ok = acceptedCurrent;
      tos.currentVersion = JOB_POSTER_TOS_VERSION;
      tos.acceptedCurrent = acceptedCurrent;
      tos.acceptedVersion = acceptedVersion;
      tos.acceptedAt = acceptedAt ?? (latest ? latest.createdAt.toISOString() : null);
      if (!acceptedCurrent) tos.reason = "TOS_OUTDATED";

      const profileRows = await db
        .select({
          address: jobPosterProfiles.address,
          city: jobPosterProfiles.city,
          stateProvince: jobPosterProfiles.stateProvince,
          country: jobPosterProfiles.country,
        })
        .from(jobPosterProfiles)
        .where(eq(jobPosterProfiles.userId, u.userId))
        .limit(1);
      const p = profileRows[0] ?? null;
      const missing: string[] = [];
      if (!String(p?.address ?? "").trim()) missing.push("address");
      if (!String(p?.city ?? "").trim()) missing.push("city");
      if (!String(p?.stateProvince ?? "").trim()) missing.push("stateProvince");
      if (!String(p?.country ?? "").trim()) missing.push("country");
      const complete = Boolean(p) && missing.length === 0;
      profile.ok = complete;
      profile.missingFields = missing;

      verified.ok = true; // Login via OTP implies a verified session in this system.

      return NextResponse.json({
        ok: true,
        role,
        roleRoot,
        onboardingRoute,
        steps: { tos, profile, verified },
      });
    }

    if (role === "ROUTER") {
      const snap = await getRouterSessionData(u.userId);
      const termsAccepted = snap.hasAcceptedTerms;
      const profileOk = snap.state === "READY";

      tos.ok = termsAccepted;
      if (!termsAccepted) tos.reason = "TERMS_REQUIRED";

      profile.ok = profileOk;
      profile.missingFields = snap.missingFields;

      verified.ok = snap.state === "READY";
      if (!verified.ok) verified.reason = snap.state;

      return NextResponse.json({
        ok: true,
        role,
        roleRoot,
        onboardingRoute,
        router: { state: snap.state, missingFields: snap.missingFields },
        steps: { tos, profile, verified },
      });
    }

    if (role === "CONTRACTOR") {
      const [acctRows, waiverRows] = await Promise.all([
        db
          .select({ status: contractorAccounts.status, wizardCompleted: contractorAccounts.wizardCompleted })
          .from(contractorAccounts)
          .where(eq(contractorAccounts.userId, u.userId))
          .limit(1),
        db
          .select({ createdAt: auditLogs.createdAt, metadata: auditLogs.metadata })
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.action, "CONTRACTOR_WAIVER_ACCEPTED"),
              eq(auditLogs.entityType, "User"),
              eq(auditLogs.entityId, u.userId),
              eq(auditLogs.actorUserId, u.userId),
            ),
          )
          .orderBy(desc(auditLogs.createdAt))
          .limit(1),
      ]);
      const acct = acctRows[0] ?? null;
      const waiver = waiverRows[0] ?? null;
      const waiverMeta = (waiver?.metadata ?? null) as any;
      const waiverAcceptedVersion = typeof waiverMeta?.version === "string" ? waiverMeta.version : null;
      const waiverAcceptedAt = typeof waiverMeta?.acceptedAt === "string" ? waiverMeta.acceptedAt : null;
      const waiverAcceptedCurrent = waiverAcceptedVersion === CONTRACTOR_WAIVER_VERSION;

      tos.ok = waiverAcceptedCurrent;
      tos.currentVersion = CONTRACTOR_WAIVER_VERSION;
      tos.acceptedCurrent = waiverAcceptedCurrent;
      tos.acceptedVersion = waiverAcceptedVersion;
      tos.acceptedAt = waiverAcceptedAt ?? (waiver ? waiver.createdAt.toISOString() : null);
      if (!waiverAcceptedCurrent) tos.reason = "WAIVER_REQUIRED";

      const wizardCompleted = Boolean(acct?.wizardCompleted);
      profile.ok = wizardCompleted;
      if (!wizardCompleted) profile.reason = "PROFILE_REQUIRED";

      const status = String((acct as any)?.status ?? "");
      verified.ok = status === "ACTIVE";
      if (!verified.ok && status) verified.reason = status;

      return NextResponse.json({
        ok: true,
        role,
        roleRoot,
        onboardingRoute,
        contractor: { wizardCompleted, status },
        steps: { tos, profile, verified },
      });
    }

    // Unknown/unsupported roles: let UI route to forbidden.
    return NextResponse.json({
      ok: true,
      role,
      roleRoot: "/forbidden",
      onboardingRoute: "/forbidden",
      steps: { tos: { ok: true }, profile: { ok: true }, verified: { ok: true } },
    });
  } catch (err) {
    const { status, message, code, context } = toHttpError(err);
    return NextResponse.json({ ok: false, error: message, code, context }, { status });
  }
}

