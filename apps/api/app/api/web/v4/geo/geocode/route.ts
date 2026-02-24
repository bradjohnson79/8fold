import { NextResponse } from "next/server";
import { requireAuth } from "@/src/auth/requireAuth";
import { geocodeWithOsm } from "@/src/services/v4/geocodeService";

export async function POST(req: Request) {
  const authed = await requireAuth(req);
  if (authed instanceof Response) return authed;
  const raw = (await req.json().catch(() => ({}))) as { query?: string };
  return NextResponse.json(await geocodeWithOsm(raw.query ?? ""));
}
