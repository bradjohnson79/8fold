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
      path: "/api/web/job-poster/drafts/save",
      method: "POST",
      sessionToken: token,
      headers: { "content-type": contentType },
      body,
      request: req,
    });
    const text = await resp.text();
    if (process.env.NODE_ENV !== "production" && !resp.ok) {
      // Dev-only: surface upstream errors without leaking secrets.
      // eslint-disable-next-line no-console
      console.error("[WEB PROXY] upstream error", {
        path: "/api/web/job-poster/drafts/save",
        status: resp.status,
        body: text.slice(0, 800),
      });
    }
    if (resp.ok) {
      return new NextResponse(text, {
        status: resp.status,
        headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
      });
    }

    const parsed = (() => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    })() as any;
    const traceId = String(parsed?.traceId ?? "").trim() || randomUUID();
    return NextResponse.json(
      {
        error: String(parsed?.error ?? "Draft save failed."),
        code: "DRAFT_SAVE_FAILED",
        requiresSupportTicket: true,
        traceId,
      },
      { status: resp.status >= 400 ? resp.status : 500 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "Draft save failed.",
        code: "DRAFT_SAVE_FAILED",
        requiresSupportTicket: true,
        traceId: randomUUID(),
      },
      { status: 500 },
    );
  }
}

