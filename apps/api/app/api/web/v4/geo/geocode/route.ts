import { NextResponse } from "next/server";
import { requireAuth } from "@/src/auth/requireAuth";
import { geocodeWithOsm } from "@/src/services/v4/geocodeService";
import { rateLimitOrThrow } from "@/src/services/v4/rateLimitService";
import { badRequest, forbidden } from "@/src/services/v4/v4Errors";

export async function POST(req: Request) {
  try {
    const authed = await requireAuth(req);
    if (authed instanceof Response) return authed;
    if (!authed.internalUser?.id) {
      throw forbidden("V4_USER_NOT_FOUND", "Authenticated user not found");
    }

    await rateLimitOrThrow({
      key: `v4:geocode:${authed.internalUser.id}`,
      windowSeconds: 600,
      max: 60,
    });

    const raw = (await req.json().catch(() => ({}))) as { query?: string };
    if (!String(raw.query ?? "").trim()) {
      throw badRequest("V4_GEO_QUERY_REQUIRED", "query is required");
    }
    return NextResponse.json(await geocodeWithOsm(raw.query ?? ""));
  } catch (err) {
    console.error("GEOCODE ERROR:", err);
    return NextResponse.json({ results: [] }, { status: 200 });
  }
}
