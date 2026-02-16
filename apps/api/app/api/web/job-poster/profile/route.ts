import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { jobPosterProfiles } from "../../../../../db/schema/jobPosterProfile";
import { requireJobPoster } from "../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../src/http/errors";
import { geocodeAddress } from "../../../../../src/jobs/location";
import { z } from "zod";

const ProfileSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().email(),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  city: z.string().trim().min(1),
  stateProvince: z.string().trim().min(2),
  country: z.enum(["CA", "US"]).default("US"),
});

export async function GET(req: Request) {
  try {
    const user = await requireJobPoster(req);

    const rows = await db
      .select()
      .from(jobPosterProfiles)
      .where(eq(jobPosterProfiles.userId, user.userId))
      .limit(1);
    const profile = rows[0] ?? null;

    if (!profile) {
      return NextResponse.json({ profile: null }, { status: 200 });
    }

    return NextResponse.json({ profile });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireJobPoster(req);
    const body = await req.json();
    const parsed = ProfileSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { city, stateProvince, country, address, ...rest } = parsed.data;

    // Geocode address
    let lat: number | null = null;
    let lng: number | null = null;
    const geo = await geocodeAddress(address ?? null, city, stateProvince, country);
    if (geo) {
      lat = geo.lat;
      lng = geo.lng;
    }

    const defaultJobLocation = address
      ? `${address}, ${city}, ${stateProvince}`
      : `${city}, ${stateProvince}`;

    const createValues: Record<string, unknown> = {
      id: randomUUID(),
      userId: user.userId,
      ...rest,
      city,
      stateProvince,
      country: country as any,
      address: address ?? null,
      lat,
      lng,
      defaultJobLocation,
    };
    const updateValues: Record<string, unknown> = {
      ...rest,
      city,
      stateProvince,
      country: country as any,
      address: address ?? null,
      lat,
      lng,
      defaultJobLocation,
      updatedAt: new Date(),
    };

    const upserted = await db
      .insert(jobPosterProfiles)
      .values(createValues as any)
      .onConflictDoUpdate({
        target: jobPosterProfiles.userId,
        set: updateValues as any,
      })
      .returning();
    const profile = upserted[0] ?? null;

    return NextResponse.json({ profile }, { status: 200 });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireJobPoster(req);
    const body = await req.json();
    const parsed = ProfileSchema.partial().safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const existingRows = await db
      .select()
      .from(jobPosterProfiles)
      .where(eq(jobPosterProfiles.userId, user.userId))
      .limit(1);
    const existing = existingRows[0] ?? null;

    if (!existing) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const { city, stateProvince, country, address, ...rest } = parsed.data;

    // Geocode if location changed
    let lat = existing.lat;
    let lng = existing.lng;
    let defaultJobLocation = existing.defaultJobLocation;

    if (city || stateProvince || address !== undefined) {
      const finalCity = city ?? existing.city;
      const finalState = stateProvince ?? existing.stateProvince;
      const finalCountry = (country ?? existing.country) as "CA" | "US";
      const finalAddress = address !== undefined ? address : existing.address;

      const geo = await geocodeAddress(finalAddress, finalCity, finalState, finalCountry);
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
      }

      defaultJobLocation = finalAddress
        ? `${finalAddress}, ${finalCity}, ${finalState}`
        : `${finalCity}, ${finalState}`;
    }

    const data: Record<string, unknown> = {
      ...rest,
      ...(city !== undefined && { city }),
      ...(stateProvince !== undefined && { stateProvince }),
      ...(country !== undefined && { country: country as any }),
      ...(address !== undefined && { address: address ?? null }),
      lat,
      lng,
      defaultJobLocation,
      updatedAt: new Date(),
    };

    const updated = await db
      .update(jobPosterProfiles)
      .set(data as any)
      .where(eq(jobPosterProfiles.userId, user.userId))
      .returning();
    const profile = updated[0] ?? null;

    return NextResponse.json({ profile }, { status: 200 });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
