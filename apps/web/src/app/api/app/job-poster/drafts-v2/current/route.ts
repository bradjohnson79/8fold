import { NextResponse } from "next/server";
import { requireSession, requireApiToken } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";
import {
  getE2EUserIdFromHeader,
  getOrCreateState,
  isE2ETestModeEnabled,
  invalidE2EIdentityResponse,
} from "@/server/e2e/jobWizardV2TestMode";

export async function GET(req: Request) {
  try {
    if (isE2ETestModeEnabled()) {
      const userId = getE2EUserIdFromHeader(req);
      if (!userId) return invalidE2EIdentityResponse();
      const state = getOrCreateState(userId);
      return NextResponse.json({
        success: true,
        draft: state.draft,
      });
    }

    await requireSession(req);
    const token = await requireApiToken();
    const resp = await apiFetch({
      path: "/api/web/job-poster/drafts-v2/current",
      method: "GET",
      sessionToken: token,
      request: req,
    });
    const text = await resp.text();
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    return NextResponse.json({ success: false, code: "CURRENT_FAILED", message: "Failed to load draft." }, { status: 500 });
  }
}
