import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { requireJobPosterReady } from "../../../../../../src/auth/onboardingGuards";
import { db } from "../../../../../../db/drizzle";
import { jobDraftV2 } from "../../../../../../db/schema/jobDraftV2";
import { jobDraftV2FieldState } from "../../../../../../db/schema/jobDraftV2FieldState";
import {
  appraiseJobTotalWithAi,
  JobPricingAppraisalError,
  type JobPricingAppraisalInput,
} from "../../../../../../src/pricing/jobPricingAppraisal";
import { jobPosterRouteErrorFromUnknown, jobPosterRouteErrorResponse } from "../../../../../../src/http/jobPosterRouteErrors";
import { logEvent } from "../../../../../../src/server/observability/log";

const route = "POST /api/web/job-poster/drafts-v2/start-appraisal";

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
    if (!process.env.OPEN_AI_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          code: "AI_CONFIG_MISSING",
          requiresSupportTicket: true,
          traceId,
        },
        { status: 503 }
      );
    }

    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const user = ready;
    userId = user.userId;

    const body = (await req.json().catch(() => null)) as {
      draftId?: string;
      expectedVersion?: number;
    } | null;

    const id = String(body?.draftId ?? "").trim();
    const expectedVersion = typeof body?.expectedVersion === "number" ? body.expectedVersion : undefined;

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
      const fieldStates = await db
        .select({ fieldKey: jobDraftV2FieldState.fieldKey, status: jobDraftV2FieldState.status, savedAt: jobDraftV2FieldState.savedAt })
        .from(jobDraftV2FieldState)
        .where(eq(jobDraftV2FieldState.draftId, id));
      return NextResponse.json(
        {
          success: false,
          code: "VERSION_CONFLICT",
          draft: draftToResponse(draft, fieldStates),
          traceId,
        },
        { status: 409 }
      );
    }

    const data = (draft.data ?? {}) as Record<string, unknown>;
    const details = (data.details ?? {}) as Record<string, unknown>;
    const profile = (data.profile ?? {}) as Record<string, unknown>;
    const items = Array.isArray(details.items) ? details.items : [];

    const stateProvince = String(
      details.geo && typeof (details.geo as any).stateCode === "string"
        ? (details.geo as any).stateCode
        : draft.stateCode || profile.stateProvince || ""
    ).trim().toUpperCase();
    const city = String(details.geo && (details.geo as any).lat ? (profile.city ?? details.address ?? "Unknown") : "Unknown").trim();

    const aiInput: JobPricingAppraisalInput = {
      title: String(details.title ?? "").trim(),
      tradeCategory: String(details.tradeCategory ?? "HANDYMAN").trim(),
      city: city || "Unknown",
      stateProvince: stateProvince || "BC",
      country: (draft.countryCode === "CA" ? "CA" : "US") as "US" | "CA",
      currency: draft.countryCode === "CA" ? "CAD" : "USD",
      jobType: details.jobType === "regional" ? "regional" : "urban",
      estimatedDurationHours: null,
      description: String(details.scope ?? "").trim(),
      items: items.map((it: any) => ({
        category: String(it?.category ?? "").trim(),
        description: String(it?.description ?? it?.item ?? "").trim(),
        quantity: Number(it?.quantity) || 1,
        notes: String(it?.notes ?? "").trim() || undefined,
      })).filter((it: any) => it.category && it.description && Number.isFinite(it.quantity) && it.quantity >= 1),
      propertyType: "unknown" as const,
      currentTotalDollars: 0,
    };

    let aiResponse: Awaited<ReturnType<typeof appraiseJobTotalWithAi>>;
    try {
      aiResponse = await appraiseJobTotalWithAi(aiInput);
    } catch (err) {
      if (err instanceof JobPricingAppraisalError) {
        return NextResponse.json(
          {
            success: false,
            code: err.code,
            requiresSupportTicket: true,
            traceId: err.traceId,
          },
          { status: err.status }
        );
      }
      return NextResponse.json(
        {
          success: false,
          code: "AI_RUNTIME_ERROR",
          requiresSupportTicket: true,
          traceId,
        },
        { status: 500 }
      );
    }

    const out = aiResponse?.output ?? null;
    const suggestedTotal = Number(out?.suggestedTotal);
    const low = Number(out?.priceRange?.low);
    const high = Number(out?.priceRange?.high);
    const confidenceScore = Number(out?.confidence);
    const reasoning = String(out?.reasoning ?? "").trim();

    const invalid =
      !out ||
      !Number.isFinite(suggestedTotal) ||
      !Number.isFinite(low) ||
      !Number.isFinite(high) ||
      !Number.isFinite(confidenceScore) ||
      confidenceScore < 0 ||
      confidenceScore > 1;

    if (invalid) {
      const pricing = (data.pricing ?? {}) as Record<string, unknown>;
      const newPricing = { ...pricing, appraisalStatus: "failed" };
      const newData = { ...data, pricing: newPricing };
      await db
        .update(jobDraftV2)
        .set({
          data: newData,
          updatedAt: new Date(),
        })
        .where(eq(jobDraftV2.id, id));
      return NextResponse.json(
        {
          success: false,
          code: "AI_INVALID_RESPONSE",
          requiresSupportTicket: true,
          traceId,
        },
        { status: 500 }
      );
    }

    const confidence = confidenceScore >= 0.75 ? "high" : confidenceScore >= 0.4 ? "medium" : "low";
    const now = new Date();
    const appraisal = {
      total: Math.round(suggestedTotal * 100),
      confidence,
      createdAt: now.toISOString(),
      model: "gpt-5-nano",
    };
    const pricing = (data.pricing ?? {}) as Record<string, unknown>;
    const newPricing = {
      ...pricing,
      appraisal,
      appraisalStatus: "ready",
    };
    const newData = { ...data, pricing: newPricing };

    const versionBefore = draft.version;
    const updateResult = await db
      .update(jobDraftV2)
      .set({
        data: newData,
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
            draft: draftToResponse(fresh, fieldStates),
            traceId,
          },
          { status: 409 }
        );
      }
    }

    const fieldStates = await db
      .select({ fieldKey: jobDraftV2FieldState.fieldKey, status: jobDraftV2FieldState.status, savedAt: jobDraftV2FieldState.savedAt })
      .from(jobDraftV2FieldState)
      .where(eq(jobDraftV2FieldState.draftId, id));

    logEvent({
      level: "info",
      event: "job_draft_v2.start_appraisal",
      route,
      context: {
        traceId,
        draftId: id,
        userId,
        versionBefore,
        versionAfter: draft.version + 1,
      },
    });

    return NextResponse.json({
      success: true,
      draft: draftToResponse(
        { ...draft, data: newData, version: draft.version + 1 } as typeof draft,
        fieldStates
      ),
      appraisal: {
        suggestedTotalCents: Math.round(suggestedTotal * 100),
        priceRange: { low, high },
        confidence,
        reasoning,
      },
      traceId,
    });
  } catch (err) {
    logEvent({
      level: "error",
      event: "job_draft_v2.start_appraisal.failed",
      route,
      context: { traceId, userId, draftId, message: err instanceof Error ? err.message : "unknown" },
    });
    return jobPosterRouteErrorFromUnknown({
      route,
      err,
      userId,
      jobId: draftId,
      extraJson: { success: false, requiresSupportTicket: true, traceId },
    });
  }
}
