import { NextResponse } from "next/server";
import { getValidatedApiOrigin } from "@/server/env";
import { getLgsAuthHeader } from "@/server/lgsAuth";

export async function GET() {
  try {
    const apiOrigin = getValidatedApiOrigin();
    const authorization = await getLgsAuthHeader();
    const resp = await fetch(`${apiOrigin}/api/lgs/auth/me`, {
      method: "GET",
      headers: { authorization },
      cache: "no-store",
    });
    const data = await resp.json().catch(() => ({}));
    return NextResponse.json(data, { status: resp.status });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 401;
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Authentication required." } },
      { status },
    );
  }
}
