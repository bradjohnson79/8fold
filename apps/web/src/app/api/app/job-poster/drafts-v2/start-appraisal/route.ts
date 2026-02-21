import { NextResponse } from "next/server";
import { requireSession, requireApiToken } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";
import {
  getE2EUserIdFromHeader,
  getOrCreateState,
  invalidE2EIdentityResponse,
  isE2ETestModeEnabled,
  traceId,
} from "@/server/e2e/jobWizardV2TestMode";

export async function POST(req: Request) {
  try {
    if (isE2ETestModeEnabled()) {
      const userId = getE2EUserIdFromHeader(req);
      if (!userId) return invalidE2EIdentityResponse();
      const state = getOrCreateState(userId);
      const body = (await req.json().catch(() => null)) as { expectedVersion?: number } | null;
      const t = traceId();
      if (typeof body?.expectedVersion !== "number") {
        return NextResponse.json(
          { success: false, code: "MISSING_EXPECTED_VERSION", message: "Missing expectedVersion.", traceId: t },
          { status: 400 },
        );
      }
      if (body.expectedVersion !== state.draft.version) {
        return NextResponse.json(
          { success: false, code: "VERSION_CONFLICT", message: "Draft version conflict.", draft: state.draft, traceId: t },
          { status: 409 },
        );
      }
      const pricing = {
        appraisalStatus: "ready",
        selectedPriceCents: 25000,
        appraisal: {
          total: 25000,
          confidence: "high",
          createdAt: new Date().toISOString(),
          model: "e2e-stub",
        },
      };
      state.draft.data = {
        ...state.draft.data,
        pricing,
      };
      state.draft.version += 1;
      return NextResponse.json({
        success: true,
        draft: state.draft,
        appraisal: {
          suggestedTotalCents: 25000,
          priceRange: { low: 200, high: 300 },
          confidence: "high",
          reasoning: "e2e deterministic stub",
        },
        traceId: t,
      });
    }

    await requireSession(req);
    const token = await requireApiToken();
    const contentType = req.headers.get("content-type") ?? "application/json";
    const body = await req.arrayBuffer();
    const resp = await apiFetch({
      path: "/api/web/job-poster/drafts-v2/start-appraisal",
      method: "POST",
      sessionToken: token,
      headers: { "content-type": contentType },
      body,
      request: req,
    });
    const text = await resp.text();
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    return NextResponse.json({ success: false, code: "START_APPRAISAL_FAILED", message: "Failed to start appraisal." }, { status: 500 });
  }
}
