import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../src/lib/auth/requireAdmin";
import { ok } from "../../../../src/lib/api/respond";

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  return ok({ isAdmin: true, userId: auth.userId });
}

