import { NextResponse } from "next/server";
import { getAdminIdentityBySessionToken, adminSessionTokenFromRequest } from "@/src/lib/auth/adminSession";

export async function GET(req: Request) {
  const token = adminSessionTokenFromRequest(req);
  if (!token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const admin = await getAdminIdentityBySessionToken(token);
  if (!admin) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  return NextResponse.json({ ok: true, data: { admin } }, { status: 200 });
}

