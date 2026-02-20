import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

export async function POST(req: Request) {
  try {
    await requireSession(req);
    const token = await requireApiToken();

    const contentType = req.headers.get("content-type") ?? "application/json";
    const body = await req.arrayBuffer();
    const resp = await apiFetch({
      path: "/api/web/job-poster/payments/verify",
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
  } catch {
    return NextResponse.json(
      {
        error: "PAYMENT_VERIFICATION_FAILED",
        code: "PAYMENT_VERIFICATION_FAILED",
        requiresSupportTicket: true,
        traceId: randomUUID(),
      },
      { status: 500 },
    );
  }
}
