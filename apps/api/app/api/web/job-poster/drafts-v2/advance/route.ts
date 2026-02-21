import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { requireJobPosterReady } from "../../../../../../src/auth/onboardingGuards";
import { db } from "../../../../../../db/drizzle";
import { jobDraftV2 } from "../../../../../../db/schema/jobDraftV2";
import { jobDraftV2FieldState } from "../../../../../../db/schema/jobDraftV2FieldState";
import {
  isTransitionAllowed,
  getNextAllowedStep,
  stepOrder,
  type Step,
} from "@8fold/shared";
import {
  profileComplete,
  detailsComplete,
  pricingComplete,
  type JobDraftV2Data,
} from "@8fold/shared";
import { classifyJobPosterRouteError } from "../../../../../../src/http/jobPosterRouteErrors";
import { logEvent } from "../../../../../../src/server/observability/log";

const route = "POST /api/web/job-poster/drafts-v2/advance";

function draftToResponse(draft: typeof jobDraftV2.$inferSelect, fieldStates: Array<{ fieldKey: string; status: string; savedAt: Date | null }>) {
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
    data: (draft.data ?? {}) as Record<string, unknown>,
    validation: (draft.validation ?? {}) as Record<string, unknown>,
    fieldStates: fieldStatesMap,
    currentStep: draft.currentStep,
  };
}

function errorJson(
  status: number,
  code: string,
  message: string,
  traceId: string,
  extra: Record<string, unknown> = {},
) {
  return NextResponse.json(
    { success: false, code, message, traceId, ...extra },
    { status },
  );
}

function stepComplete(step: Step, data: JobDraftV2Data | undefined): boolean {
  switch (step) {
    case "PROFILE":
      return profileComplete(data?.profile);
    case "DETAILS":
      return detailsComplete(data?.details);
    case "PRICING":
      return pricingComplete(data?.pricing);
    case "PAYMENT":
      return pricingComplete(data?.pricing);
    case "CONFIRMED":
      return true;
    default:
      return false;
  }
}

export async function POST(req: Request) {
  const traceId = randomUUID();
  let userId: string | null = null;
  let draftId: string | null = null;
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const user = ready;
    userId = user.userId;

    const body = (await req.json().catch(() => null)) as {
      draftId?: string;
      expectedVersion?: number;
      targetStep?: string;
    } | null;

    const id = String(body?.draftId ?? "").trim();
    const expectedVersion = typeof body?.expectedVersion === "number" ? body.expectedVersion : undefined;
    const targetStepRaw = String(body?.targetStep ?? "").trim() as Step;

    draftId = id || null;

    if (!id) return errorJson(400, "MISSING_DRAFT_ID", "Missing draftId.", traceId);

    const validSteps: Step[] = [...stepOrder];
    if (!validSteps.includes(targetStepRaw)) {
      return errorJson(409, "STEP_INVALID", "Target step is not valid.", traceId);
    }

    const draftRows = await db
      .select()
      .from(jobDraftV2)
      .where(and(eq(jobDraftV2.id, id), eq(jobDraftV2.userId, user.userId)))
      .limit(1);
    const draft = draftRows[0] ?? null;

    if (!draft) {
      return errorJson(404, "DRAFT_NOT_FOUND", "Draft not found.", traceId);
    }

    const currentStep = draft.currentStep as Step;

    if (!isTransitionAllowed(currentStep, targetStepRaw)) {
      const fieldStates = await db
        .select({ fieldKey: jobDraftV2FieldState.fieldKey, status: jobDraftV2FieldState.status, savedAt: jobDraftV2FieldState.savedAt })
        .from(jobDraftV2FieldState)
        .where(eq(jobDraftV2FieldState.draftId, id));
      return NextResponse.json(
        {
          success: false,
          code: "STEP_INVALID",
          message: "Step transition is not allowed from current step.",
          draft: draftToResponse(draft, fieldStates),
          traceId,
        },
        { status: 409 }
      );
    }

    const data = (draft.data ?? {}) as JobDraftV2Data;
    if (!stepComplete(currentStep, data)) {
      const fieldStates = await db
        .select({ fieldKey: jobDraftV2FieldState.fieldKey, status: jobDraftV2FieldState.status, savedAt: jobDraftV2FieldState.savedAt })
        .from(jobDraftV2FieldState)
        .where(eq(jobDraftV2FieldState.draftId, id));
      return NextResponse.json(
        {
          success: false,
          code: "STEP_INVALID",
          message: "Current step invariants are not satisfied.",
          draft: draftToResponse(draft, fieldStates),
          traceId,
        },
        { status: 409 }
      );
    }

    if (typeof expectedVersion !== "number") {
      return errorJson(400, "MISSING_EXPECTED_VERSION", "Missing expectedVersion.", traceId);
    }
    if (expectedVersion !== draft.version) {
      const fieldStates = await db
        .select({ fieldKey: jobDraftV2FieldState.fieldKey, status: jobDraftV2FieldState.status, savedAt: jobDraftV2FieldState.savedAt })
        .from(jobDraftV2FieldState)
        .where(eq(jobDraftV2FieldState.draftId, id));
      return NextResponse.json(
        {
          success: false,
          code: "VERSION_CONFLICT",
          message: "Draft version conflict.",
          draft: draftToResponse(draft, fieldStates),
          traceId,
        },
        { status: 409 }
      );
    }

    const versionBefore = draft.version;
    const now = new Date();

    const updateResult = await db
      .update(jobDraftV2)
      .set({
        currentStep: targetStepRaw,
        updatedAt: now,
        version: draft.version + 1,
      })
      .where(and(eq(jobDraftV2.id, id), eq(jobDraftV2.version, expectedVersion)))
      .returning();

    if (updateResult.length === 0) {
      const freshRows = await db.select().from(jobDraftV2).where(eq(jobDraftV2.id, id)).limit(1);
      const fresh = freshRows[0] ?? null;
      if (fresh) {
        const fieldStates = await db
          .select({ fieldKey: jobDraftV2FieldState.fieldKey, status: jobDraftV2FieldState.status, savedAt: jobDraftV2FieldState.savedAt })
          .from(jobDraftV2FieldState)
          .where(eq(jobDraftV2FieldState.draftId, id));
        return NextResponse.json(
          {
            success: false,
            code: "VERSION_CONFLICT",
            message: "Draft version conflict.",
            draft: draftToResponse(fresh, fieldStates),
            traceId,
          },
          { status: 409 }
        );
      }
    }

    const updated = updateResult[0] ?? draft;
    const allStates = await db
      .select({ fieldKey: jobDraftV2FieldState.fieldKey, status: jobDraftV2FieldState.status, savedAt: jobDraftV2FieldState.savedAt })
      .from(jobDraftV2FieldState)
      .where(eq(jobDraftV2FieldState.draftId, id));

    const nextAllowedStep = getNextAllowedStep(targetStepRaw);

    logEvent({
      level: "info",
      event: "job_draft_v2.advance",
      route,
      context: {
        traceId,
        draftId: id,
        userId,
        currentStep: targetStepRaw,
        versionBefore,
        versionAfter: draft.version + 1,
      },
    });

    return NextResponse.json({
      success: true,
      draft: draftToResponse(
        { ...updated, currentStep: targetStepRaw, version: draft.version + 1 } as typeof draft,
        allStates
      ),
      currentStep: targetStepRaw,
      nextAllowedStep,
      traceId,
    });
  } catch (err) {
    logEvent({
      level: "error",
      event: "job_draft_v2.advance.failed",
      route,
      context: { traceId, userId, draftId, message: err instanceof Error ? err.message : "unknown" },
    });
    const { status } = classifyJobPosterRouteError(err);
    return errorJson(
      status >= 400 && status < 600 ? status : 500,
      "DRAFT_ADVANCE_FAILED",
      "Failed to advance draft step.",
      traceId,
    );
  }
}
