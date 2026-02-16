import { NextResponse } from "next/server";
import { getSidFromRequest, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

function asRole(roleRaw: unknown): string {
  return String(roleRaw ?? "").trim().toUpperCase();
}

/**
 * Minimal incentives surface for apps/web (prevents 404s).
 * Waiver acceptance is tracked via contractor_accounts (waiverAccepted/waiverAcceptedAt).
 */
export async function GET(req: Request) {
  try {
    await requireSession(req);
    const token = getSidFromRequest(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const resp = await apiFetch({ path: "/api/web/contractor-incentives", method: "GET", sessionToken: token, request: req });
    const text = await resp.text();
    return new NextResponse(text, { status: resp.status, headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" } });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    const msg = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: msg }, { status });
  }
}

