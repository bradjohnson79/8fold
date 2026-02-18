import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { jobPosterProfiles } from "../../../../../db/schema/jobPosterProfile";
import { users } from "../../../../../db/schema/user";
import { requireJobPoster } from "../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../src/http/errors";
import { z } from "zod";

const ProfileSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().email(),
  phone: z.string().trim().optional(),
  // Legal address (manual)
  legalStreet: z.string().trim().min(1),
  legalCity: z.string().trim().min(1),
  legalProvince: z.string().trim().min(2),
  legalPostalCode: z.string().trim().min(3),
  legalCountry: z.enum(["CA", "US"]).default("US"),

  // Map location (required for routing coords)
  mapDisplayName: z.string().trim().min(1),
  lat: z.number(),
  lng: z.number(),
});

function isValidGeo(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

export async function GET(req: Request) {
  try {
    const user = await requireJobPoster(req);

    const [rows, urows] = await Promise.all([
      db.select().from(jobPosterProfiles).where(eq(jobPosterProfiles.userId, user.userId)).limit(1),
      db
        .select({ formattedAddress: users.formattedAddress, latitude: users.latitude, longitude: users.longitude })
        .from(users)
        .where(eq(users.id, user.userId))
        .limit(1),
    ]);
    const profile = rows[0] ?? null;
    const geo = urows[0] ?? null;

    if (!profile) {
      return NextResponse.json({ profile: null }, { status: 200 });
    }

    return NextResponse.json({
      profile: {
        ...profile,
        mapDisplayName: geo?.formattedAddress ?? "",
        lat: typeof profile.lat === "number" ? profile.lat : (geo?.latitude ?? 0),
        lng: typeof profile.lng === "number" ? profile.lng : (geo?.longitude ?? 0),
      },
    });
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

    const { legalStreet, legalCity, legalProvince, legalPostalCode, legalCountry, mapDisplayName, lat, lng, ...rest } =
      parsed.data;

    if (!isValidGeo(lat, lng)) {
      return NextResponse.json({ ok: false, code: "MAP_LOCATION_REQUIRED" }, { status: 400 });
    }

    const defaultJobLocation = `${legalStreet}, ${legalCity}, ${legalProvince}`;

    const createValues: Record<string, unknown> = {
      id: randomUUID(),
      userId: user.userId,
      ...rest,
      city: legalCity,
      stateProvince: legalProvince,
      postalCode: legalPostalCode || null,
      country: legalCountry as any,
      address: legalStreet,
      lat,
      lng,
      defaultJobLocation,
    };
    const updateValues: Record<string, unknown> = {
      ...rest,
      city: legalCity,
      stateProvince: legalProvince,
      postalCode: legalPostalCode || null,
      country: legalCountry as any,
      address: legalStreet,
      lat,
      lng,
      defaultJobLocation,
      updatedAt: new Date(),
    };

    const upserted = await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          formattedAddress: mapDisplayName,
          latitude: lat,
          longitude: lng,
          legalStreet,
          legalCity,
          legalProvince,
          legalPostalCode,
          legalCountry: legalCountry as any,
          country: legalCountry as any,
          updatedAt: new Date(),
        } as any)
        .where(eq(users.id, user.userId));

      return await tx
        .insert(jobPosterProfiles)
        .values(createValues as any)
        .onConflictDoUpdate({
          target: jobPosterProfiles.userId,
          set: updateValues as any,
        })
        .returning();
    });
    const profile = upserted[0] ?? null;

    return NextResponse.json({ profile }, { status: 200 });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
