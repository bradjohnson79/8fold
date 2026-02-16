import { NextResponse } from "next/server";
import { readJsonBody } from "@/server/api/readJsonBody";
import { apiFetch } from "@/server/api/apiClient";

export async function POST(req: Request) {
  try {
    const j = await readJsonBody(req);
    if (!j.ok) return j.resp;
    const body = j.json as any;

    const resp = await apiFetch({
      path: "/api/auth/verify",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      request: req,
    });
    const text = await resp.text().catch(() => "");

    // apps/api is the single authority for session creation.
    // Forward upstream body + status + Set-Cookie headers as-is.
    const res = new NextResponse(text, {
      status: resp.status,
      headers: { "content-type": resp.headers.get("content-type") ?? "application/json" },
    });

    const h: any = resp.headers as any;
    const setCookies: string[] = typeof h.getSetCookie === "function" ? h.getSetCookie() : [];
    if (setCookies.length) {
      for (const c of setCookies) res.headers.append("set-cookie", c);
    } else {
      const sc = resp.headers.get("set-cookie");
      if (sc) res.headers.append("set-cookie", sc);
    }

    return res;
  } catch (err) {
    return NextResponse.json({ ok: false, error: "Server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

