import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { and, eq } from "drizzle-orm";
import { requireJobPosterReady } from "../../../../../../src/auth/onboardingGuards";
import { db } from "../../../../../../db/drizzle";
import { jobDraftV2 } from "../../../../../../db/schema/jobDraftV2";
import { jobDraftV2FieldState } from "../../../../../../db/schema/jobDraftV2FieldState";
import {
  isValidFieldKey,
  validateFieldValue,
  computeDraftValidation,
  type FieldKey,
} from "@8fold/shared";
import { classifyJobPosterRouteError } from "../../../../../../src/http/jobPosterRouteErrors";
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

    if (!id) return errorJson(400, "MISSING_DRAFT_ID", "Missing draftId.", traceId);

    if (!isValidFieldKey(fieldKeyRaw)) {
      return errorJson(400, "INVALID_FIELD_KEY", "Invalid field key.", traceId);
    }

    const fieldKey = fieldKeyRaw as FieldKey;

    const draftRows = await db
      .select()
      .from(jobDraftV2)
      .where(and(eq(jobDraftV2.id, id), eq(jobDraftV2.userId, user.userId)))
      .limit(1);
    const draft = draftRows[0] ?? null;

    if (!draft) {
      return errorJson(404, "DRAFT_NOT_FOUND", "Draft not found.", traceId);
    }

    if (typeof expectedVersion !== "number") {
      return errorJson(400, "MISSING_EXPECTED_VERSION", "Missing expectedVersion.", traceId);
    }
    if (expectedVersion !== draft.version) {
      return NextResponse.json(
        {
          success: false,
          code: "VERSION_CONFLICT",
          message: "Draft version conflict.",
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
      await db
        .insert(jobDraftV2FieldState)
        .values({
          draftId: id,
          fieldKey,
          valueHash: null,
          status: "error" as const,
          savedAt: null,
          lastErrorCode: "VALIDATION_FAILED",
          lastErrorMessage: validation.message,
        })
        .onConflictDoUpdate({
          target: [jobDraftV2FieldState.draftId, jobDraftV2FieldState.fieldKey],
          set: {
            status: "error" as const,
            savedAt: null,
            lastErrorCode: "VALIDATION_FAILED",
            lastErrorMessage: validation.message,
          },
        });
      return errorJson(400, "VALIDATION_FAILED", validation.message, traceId, {
        fieldErrors: { [fieldKey]: validation.message },
      });
    }

    if (fieldKey === "details.geo" && value && typeof value === "object") {
      const geo = value as { countryCode?: string; stateCode?: string };
      const gotCountry = String(geo.countryCode ?? "").trim().toUpperCase();
      const gotState = String(geo.stateCode ?? "").trim().toUpperCase();
      const expectedCountry = String(draft.countryCode ?? "").trim().toUpperCase();
      const expectedState = String(draft.stateCode ?? "").trim().toUpperCase();
      if (gotCountry && gotState && (gotCountry !== expectedCountry || gotState !== expectedState)) {
        return errorJson(409, "JURISDICTION_MISMATCH", "Geo jurisdiction does not match draft jurisdiction.", traceId, {
          expected: { countryCode: expectedCountry, stateCode: expectedState },
          got: { countryCode: gotCountry, stateCode: gotState },
        });
      }
    }

    const versionBefore = draft.version;
    const newData = setNestedValue((draft.data ?? {}) as Record<string, unknown>, fieldKey, value);
    const nextValidation = computeDraftValidation(newData);
    const now = new Date();

    const updateResult = await db
      .update(jobDraftV2)
      .set({
        data: newData,
        validation: nextValidation,
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
            message: "Draft version conflict.",
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
      context: {
        traceId,
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
        { ...finalDraft, data: newData, validation: nextValidation, version: finalVersion } as typeof draft,
        allStates
      ),
      traceId,
    });
  } catch (err) {
    logEvent({
      level: "error",
      event: "job_draft_v2.save_field.failed",
      route,
      context: { traceId, userId, draftId, message: err instanceof Error ? err.message : "unknown" },
    });
    const { status } = classifyJobPosterRouteError(err);
    return errorJson(status >= 400 && status < 600 ? status : 500, "DRAFT_SAVE_FAILED", "Failed to save field.", traceId);
  }
}
