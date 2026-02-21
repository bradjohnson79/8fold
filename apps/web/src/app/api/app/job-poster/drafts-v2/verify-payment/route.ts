import { NextResponse } from "next/server";
import { requireSession, requireApiToken } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";
import {
  getE2EUserIdFromHeader,
  getOrCreateState,
  invalidE2EIdentityResponse,
  isE2ETestModeEnabled,
  verifyPayment,
} from "@/server/e2e/jobWizardV2TestMode";

export async function POST(req: Request) {
  try {
    if (isE2ETestModeEnabled()) {
      const userId = getE2EUserIdFromHeader(req);
      if (!userId) return invalidE2EIdentityResponse();
      const state = getOrCreateState(userId);
      const body = (await req.json().catch(() => null)) as { paymentIntentId?: string } | null;
      const result = verifyPayment(state, String(body?.paymentIntentId ?? "").trim());
      return NextResponse.json(result.body, { status: result.status });
    }

    await requireSession(req);
    const token = await requireApiToken();
    const contentType = req.headers.get("content-type") ?? "application/json";
    const body = await req.arrayBuffer();
    const resp = await apiFetch({
      path: "/api/web/job-poster/drafts-v2/verify-payment",
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
    return NextResponse.json({ success: false, code: "VERIFY_PAYMENT_FAILED", message: "Failed to verify payment." }, { status: 500 });
  }
}
