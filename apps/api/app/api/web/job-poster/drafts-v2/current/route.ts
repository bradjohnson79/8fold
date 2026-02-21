import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { requireJobPosterReady } from "../../../../../../src/auth/onboardingGuards";
import { db } from "../../../../../../db/drizzle";
import { jobDraftV2 } from "../../../../../../db/schema/jobDraftV2";
import { jobDraftV2FieldState } from "../../../../../../db/schema/jobDraftV2FieldState";
import { jobPosterProfiles } from "../../../../../../db/schema/jobPosterProfile";
import { DB_SCHEMA } from "../../../../../../db/schema/_dbSchema";
import { logEvent } from "../../../../../../src/server/observability/log";

const route = "GET /api/web/job-poster/drafts-v2/current";

function draftToResponse(draft: typeof jobDraftV2.$inferSelect, fieldStates: Array<{ fieldKey: string; status: string; savedAt: Date | null; valueHash: string | null }>) {
  const fieldStatesMap: Record<string, { status: string; savedAt: string | null }> = {};
  for (const fs of fieldStates) {
    fieldStatesMap[fs.fieldKey] = {
      status: fs.status,
      savedAt: fs.savedAt ? fs.savedAt.toISOString() : null,
    };
  }
  return {
    id: draft.id,
    version: draft.version,
    currentStep: draft.currentStep,
    countryCode: draft.countryCode,
    stateCode: draft.stateCode,
    data: (draft.data ?? {}) as Record<string, unknown>,
    validation: (draft.validation ?? {}) as Record<string, unknown>,
    fieldStates: fieldStatesMap,
    lastSavedAt: draft.lastSavedAt ? draft.lastSavedAt.toISOString() : null,
    jobId: draft.jobId,
    paymentIntentId: draft.paymentIntentId,
  };
}

export async function GET(req: Request) {
  const traceId = randomUUID();
  let userId: string | null = null;
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const user = ready;
    userId = user.userId;

    // Active draft = latest for user where currentStep != CONFIRMED AND archivedAt IS NULL
    const drafts = await db
      .select()
      .from(jobDraftV2)
      .where(
        and(
          eq(jobDraftV2.userId, user.userId),
          ne(jobDraftV2.currentStep, "CONFIRMED"),
          isNull(jobDraftV2.archivedAt)
        )
      )
      .orderBy(desc(jobDraftV2.createdAt))
      .limit(1);

    const active = drafts[0] ?? null;

    if (active) {
      const fieldStates = await db
        .select({ fieldKey: jobDraftV2FieldState.fieldKey, status: jobDraftV2FieldState.status, savedAt: jobDraftV2FieldState.savedAt, valueHash: jobDraftV2FieldState.valueHash })
        .from(jobDraftV2FieldState)
        .where(eq(jobDraftV2FieldState.draftId, active.id));

      return NextResponse.json({
        success: true,
        draft: draftToResponse(active, fieldStates),
        traceId,
      });
    }

    // Create new draft - inherit countryCode/stateCode from profile
    const profileRows = await db
      .select({ country: jobPosterProfiles.country, stateProvince: jobPosterProfiles.stateProvince })
      .from(jobPosterProfiles)
      .where(eq(jobPosterProfiles.userId, user.userId))
      .limit(1);
    const profile = profileRows[0] ?? null;
    const countryCode = (profile?.country ?? "US") as "US" | "CA";
    const stateCode = String(profile?.stateProvince ?? "").trim().toUpperCase() || "";

    const newId = randomUUID();
    const now = new Date();
    await db.insert(jobDraftV2).values({
      id: newId,
      userId: user.userId,
      countryCode,
      stateCode,
      currentStep: "PROFILE",
      data: {},
      validation: {},
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    const created = await db.select().from(jobDraftV2).where(eq(jobDraftV2.id, newId)).limit(1);
    const draft = created[0];
    if (!draft) throw new Error("Failed to create draft");

    logEvent({
      level: "info",
      event: "job_draft_v2.created",
      route,
      context: { traceId, draftId: newId, userId: user.userId },
    });

    return NextResponse.json({
      success: true,
      draft: draftToResponse(draft, []),
      traceId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    const stack = err instanceof Error ? err.stack : undefined;
    logEvent({
      level: "error",
      event: "job_draft_v2.current.failed",
      route,
      context: {
        traceId,
        userId,
        runtimeSchema: DB_SCHEMA,
        message,
        stack,
        code: typeof (err as { code?: unknown })?.code === "string" ? (err as { code: string }).code : undefined,
      },
    });
    return NextResponse.json({ success: false, code: "CURRENT_FAILED", traceId }, { status: 500 });
  }
}
