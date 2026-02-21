import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireSession, requireApiToken } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";
import {
  getE2EUserIdFromHeader,
  getOrCreateState,
  isE2ETestModeEnabled,
  invalidE2EIdentityResponse,
} from "@/server/e2e/jobWizardV2TestMode";

export async function GET(req: Request) {
  const traceId = randomUUID();
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
    const ct = resp.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      return NextResponse.json(
        { success: false, code: "UPSTREAM_SHAPE_INVALID", traceId, status: resp.status },
        { status: 502 }
      );
    }
    try {
      JSON.parse(text);
    } catch {
      return NextResponse.json(
        { success: false, code: "UPSTREAM_SHAPE_INVALID", traceId, status: resp.status },
        { status: 502 }
      );
    }
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": ct },
    });
  } catch (err) {
    const status =
      typeof (err as { status?: unknown })?.status === "number"
        ? ((err as { status: number }).status || 500)
        : typeof (err as { cause?: { status?: unknown } })?.cause?.status === "number"
          ? ((err as { cause: { status: number } }).cause.status || 500)
          : 500;
    return NextResponse.json(
      { success: false, code: "CURRENT_FAILED", traceId, message: "Failed to load draft." },
      { status }
    );
  }
}
