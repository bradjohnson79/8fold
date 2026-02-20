import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

function getDraftIdFromUrl(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("drafts");
  return idx >= 0 ? (parts[idx + 1] ?? "") : "";
}

export async function POST(req: Request) {
  try {
    await requireSession(req);
    const token = await requireApiToken();
    const id = getDraftIdFromUrl(req);

    const contentType = req.headers.get("content-type") ?? "application/json";
    const body = await req.arrayBuffer();
    const resp = await apiFetch({
      path: `/api/web/job-poster/drafts/${encodeURIComponent(id)}/start-appraisal`,
      method: "POST",
      sessionToken: token,
      headers: { "content-type": contentType },
      body,
      request: req,
    });
    const text = await resp.text();
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
    const codeRaw = String(parsed?.code ?? "").trim();
    const code =
      codeRaw === "AI_CONFIG_MISSING" || codeRaw === "AI_RUNTIME_ERROR" || codeRaw === "AI_INVALID_RESPONSE"
        ? codeRaw
        : "AI_RUNTIME_ERROR";
    const traceId = String(parsed?.traceId ?? "").trim() || randomUUID();
    return NextResponse.json(
      {
        error: String(parsed?.error ?? "Pricing could not be generated."),
        code,
        requiresSupportTicket: true,
        traceId,
      },
      { status: resp.status >= 400 ? resp.status : 500 },
    );
  } catch (err) {
    const traceId = randomUUID();
    return NextResponse.json(
      {
        error: "Pricing could not be generated.",
        code: "AI_RUNTIME_ERROR",
        requiresSupportTicket: true,
        traceId,
      },
      { status: 500 },
    );
  }
}

