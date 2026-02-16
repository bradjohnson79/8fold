import { NextResponse } from "next/server";
import { readJsonBody } from "@/server/api/readJsonBody";
import { apiFetch } from "@/server/api/apiClient";

function safeJsonParse(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const j = await readJsonBody(req);
    if (!j.ok) return j.resp;
    const body = j.json;

    let resp: Response;
    try {
      resp = await apiFetch({
        path: "/api/auth/request",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      // Return a *clean* failure for local dev (apps/api not running, wrong port, etc).
      return NextResponse.json(
        { ok: false, error: "Backend auth service unreachable (is apps/api running?)", code: "UPSTREAM_UNREACHABLE" },
        { status: 424 },
      );
    }

    const text = await resp.text();
    const parsed = safeJsonParse(text);

    if (!resp.ok) {
      if (parsed && typeof parsed === "object") {
        const errMsg = String((parsed as any).error ?? `Upstream error (${resp.status})`);
        return NextResponse.json({ ok: false, error: errMsg, code: (parsed as any).code ?? "UPSTREAM_ERROR" }, { status: resp.status });
      }
      return NextResponse.json(
        { ok: false, error: text.slice(0, 300) || `Upstream error (${resp.status})`, code: "UPSTREAM_ERROR" },
        { status: resp.status },
      );
    }

    // Upstream succeeded; still guard against non-JSON responses.
    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json(
        { ok: false, error: text.slice(0, 300) || "Upstream returned invalid response", code: "UPSTREAM_INVALID_RESPONSE" },
        { status: 502 },
      );
    }

    // Preserve upstream payload (e.g. { ok:true, debugCode?... }).
    return NextResponse.json(parsed, { status: 200 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: "Server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

