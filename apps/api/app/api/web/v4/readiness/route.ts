import { NextResponse } from "next/server";
import { requireAuth } from "@/src/auth/requireAuth";
import { getV4Readiness } from "@/src/services/v4/readinessService";

export async function GET(req: Request) {
  const authed = await requireAuth(req);
  if (authed instanceof Response) return authed;
  if (!authed.internalUser) return NextResponse.json({ ok: false, error: "USER_NOT_FOUND" }, { status: 403 });
  return NextResponse.json(await getV4Readiness(authed.internalUser.id), { status: 200 });
}
