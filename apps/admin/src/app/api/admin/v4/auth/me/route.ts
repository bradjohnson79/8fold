import { NextResponse } from "next/server";
import { getValidatedApiOrigin } from "@/server/env";
import { getAdminAuthHeader } from "@/server/clerkApiAuth";

export async function GET() {
  try {
    const apiOrigin = getValidatedApiOrigin();
    const authorization = await getAdminAuthHeader();
    const url = `${apiOrigin}/api/admin/v4/auth/me`;

    const resp = await fetch(url, {
      method: "GET",
      headers: { authorization },
      cache: "no-store",
    });

    const text = await resp.text();
    const out = new NextResponse(text, { status: resp.status });
    out.headers.set("content-type", resp.headers.get("content-type") ?? "application/json");
    return out;
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 401;
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: status === 401 ? "UNAUTHORIZED" : "UPSTREAM_ERROR",
          message: status === 401 ? "Authentication required." : "Failed to load admin profile.",
        },
      },
      { status },
    );
  }
}
