import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { and, eq } from "drizzle-orm";
import { requireJobPosterReady } from "../../../../../../src/auth/onboardingGuards";
import { db } from "../../../../../../db/drizzle";
import { jobDraftV2 } from "../../../../../../db/schema/jobDraftV2";
import { jobDraftV2FieldState } from "../../../../../../db/schema/jobDraftV2FieldState";
import {
  ALL_FIELD_KEYS,
  isValidFieldKey,
  validateFieldValue,
  type FieldKey,
} from "@8fold/shared";
import { jobPosterRouteErrorFromUnknown, jobPosterRouteErrorResponse } from "../../../../../../src/http/jobPosterRouteErrors";
import { logEvent } from "../../../../../../src/server/observability/log";

const route = "POST /api/web/job-poster/drafts-v2/save-field";

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(obj));
  const parts = path.split(".");
  let cur: Record<string, unknown> = out;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!(key in cur) || typeof cur[key] !== "object" || cur[key] === null) {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
  return out;
}

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
      fieldKey?: string;
      value?: unknown;
    } | null;

    const id = String(body?.draftId ?? "").trim();
    const expectedVersion = typeof body?.expectedVersion === "number" ? body.expectedVersion : undefined;
    const fieldKeyRaw = String(body?.fieldKey ?? "").trim();
    const value = body?.value;

    draftId = id || null;

    if (!id) {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "VALIDATION_ERROR",
        status: 400,
        err: new Error("Missing draftId"),
        userId,
        jobId: draftId,
        extraJson: { success: false, code: "MISSING_DRAFT_ID", traceId },
      });
    }

    if (!isValidFieldKey(fieldKeyRaw)) {
      return NextResponse.json(
        { success: false, code: "INVALID_FIELD_KEY", traceId },
        { status: 400 }
      );
    }

    const fieldKey = fieldKeyRaw as FieldKey;

    const draftRows = await db
      .select()
      .from(jobDraftV2)
      .where(and(eq(jobDraftV2.id, id), eq(jobDraftV2.userId, user.userId)))
      .limit(1);
    const draft = draftRows[0] ?? null;

    if (!draft) {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "INTERNAL_ERROR",
        status: 404,
        err: new Error("Draft not found"),
        userId,
        jobId: id,
        extraJson: { success: false, code: "DRAFT_NOT_FOUND", traceId },
      });
    }

    if (typeof expectedVersion !== "number" || expectedVersion !== draft.version) {
      return NextResponse.json(
        {
          success: false,
          code: "VERSION_CONFLICT",
          draft: draftToResponse(draft, []),
          traceId,
        },
        { status: 409 }
      );
    }

    const valueHash = createHash("sha256").update(JSON.stringify(value)).digest("hex");

    const existingFieldState = await db
      .select()
      .from(jobDraftV2FieldState)
      .where(and(eq(jobDraftV2FieldState.draftId, id), eq(jobDraftV2FieldState.fieldKey, fieldKey)))
      .limit(1);

    const existing = existingFieldState[0] ?? null;

    if (existing?.valueHash === valueHash) {
      const allStates = await db
        .select({ fieldKey: jobDraftV2FieldState.fieldKey, status: jobDraftV2FieldState.status, savedAt: jobDraftV2FieldState.savedAt })
        .from(jobDraftV2FieldState)
        .where(eq(jobDraftV2FieldState.draftId, id));
      return NextResponse.json({
        success: true,
        draft: draftToResponse(draft, allStates),
        traceId,
      });
    }

    const validation = validateFieldValue(fieldKey, value);
    if (!validation.ok) {
      return NextResponse.json(
        {
          success: false,
          code: "VALIDATION_FAILED",
          fieldErrors: { [fieldKey]: validation.message },
          traceId,
        },
        { status: 400 }
      );
    }

    if (fieldKey === "details.geo" && value && typeof value === "object") {
      const geo = value as { countryCode?: string; stateCode?: string };
      const gotCountry = String(geo.countryCode ?? "").trim().toUpperCase();
      const gotState = String(geo.stateCode ?? "").trim().toUpperCase();
      const expectedCountry = String(draft.countryCode ?? "").trim().toUpperCase();
      const expectedState = String(draft.stateCode ?? "").trim().toUpperCase();
      if (gotCountry && gotState && (gotCountry !== expectedCountry || gotState !== expectedState)) {
        return NextResponse.json(
          {
            success: false,
            code: "JURISDICTION_MISMATCH",
            expected: { countryCode: expectedCountry, stateCode: expectedState },
            got: { countryCode: gotCountry, stateCode: gotState },
            traceId,
          },
          { status: 409 }
        );
      }
    }

    const versionBefore = draft.version;
    const newData = setNestedValue((draft.data ?? {}) as Record<string, unknown>, fieldKey, value);
    const now = new Date();

    const updateResult = await db
      .update(jobDraftV2)
      .set({
        data: newData,
        lastSavedAt: now,
        updatedAt: now,
        version: draft.version + 1,
      })
      .where(and(eq(jobDraftV2.id, id), eq(jobDraftV2.version, expectedVersion)))
      .returning();

    if (updateResult.length === 0) {
      const freshRows = await db.select().from(jobDraftV2).where(eq(jobDraftV2.id, id)).limit(1);
      const fresh = freshRows[0] ?? null;
      if (fresh) {
        const allStates = await db
          .select({ fieldKey: jobDraftV2FieldState.fieldKey, status: jobDraftV2FieldState.status, savedAt: jobDraftV2FieldState.savedAt })
          .from(jobDraftV2FieldState)
          .where(eq(jobDraftV2FieldState.draftId, id));
        return NextResponse.json(
          {
            success: false,
            code: "VERSION_CONFLICT",
            draft: draftToResponse(fresh, allStates),
            traceId,
          },
          { status: 409 }
        );
      }
    }

    await db
      .insert(jobDraftV2FieldState)
      .values({
        draftId: id,
        fieldKey,
        valueHash,
        status: "saved" as const,
        savedAt: now,
        lastErrorCode: null,
        lastErrorMessage: null,
      })
      .onConflictDoUpdate({
        target: [jobDraftV2FieldState.draftId, jobDraftV2FieldState.fieldKey],
        set: {
          valueHash,
          status: "saved" as const,
          savedAt: now,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });

    const updated = updateResult[0];
    const allStates = await db
      .select({ fieldKey: jobDraftV2FieldState.fieldKey, status: jobDraftV2FieldState.status, savedAt: jobDraftV2FieldState.savedAt })
      .from(jobDraftV2FieldState)
      .where(eq(jobDraftV2FieldState.draftId, id));

    const finalVersion = updated ? draft.version + 1 : draft.version;

    logEvent({
      level: "info",
      event: "job_draft_v2.save_field",
      route,
      traceId,
      context: {
        draftId: id,
        userId,
        fieldKey,
        versionBefore,
        versionAfter: finalVersion,
      },
    });

    const finalDraft = updated ?? draft;
    return NextResponse.json({
      success: true,
      draft: draftToResponse(
        { ...finalDraft, data: newData, version: finalVersion } as typeof draft,
        allStates
      ),
      traceId,
    });
  } catch (err) {
    logEvent({
      level: "error",
      event: "job_draft_v2.save_field.failed",
      route,
      traceId,
      context: { userId, draftId, message: err instanceof Error ? err.message : "unknown" },
    });
    return jobPosterRouteErrorFromUnknown({
      route,
      err,
      userId,
      jobId: draftId,
      extraJson: { success: false, code: "DRAFT_SAVE_FAILED", requiresSupportTicket: true, traceId },
    });
  }
}
