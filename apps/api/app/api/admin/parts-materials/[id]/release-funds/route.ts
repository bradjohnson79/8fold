import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ ok: false, error: "not_implemented" }, { status: 501 });
}

