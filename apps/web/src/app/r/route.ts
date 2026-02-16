import { NextResponse } from "next/server";

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const refRaw = String(url.searchParams.get("ref") ?? "").trim();
  const ref = refRaw && isUuid(refRaw) ? refRaw : "";

  // Always redirect (no onboarding attachment here).
  const res = NextResponse.redirect(new URL("/", req.url));

  if (ref) {
    res.cookies.set("router_ref", ref, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      secure: process.env.NODE_ENV === "production",
    });
  }

  return res;
}

