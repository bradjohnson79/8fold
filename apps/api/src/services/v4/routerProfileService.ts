import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { routers } from "@/db/schema/router";
import { routerProfilesV4 } from "@/db/schema/routerProfileV4";
import { users } from "@/db/schema/user";
import { type V4RouterProfileInput, V4RouterProfileSchema } from "@/src/validation/v4/routerProfileSchema";
import type { ClerkIdentity } from "@/src/auth/getClerkIdentity";

function normalizeCountryCode(raw: string | null | undefined): "US" | "CA" {
  return String(raw ?? "").trim().toUpperCase() === "CA" ? "CA" : "US";
}

export async function getV4RouterProfile(userId: string) {
  const [profileRows, userRows] = await Promise.all([
    db.select().from(routerProfilesV4).where(eq(routerProfilesV4.userId, userId)).limit(1),
    db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1),
  ]);
  const profile = profileRows[0] ?? null;
  const user = userRows[0] ?? null;
  return {
    ok: true as const,
    profile: profile
      ? {
          firstName: profile.firstName ?? null,
          lastName: profile.lastName ?? null,
          contactName: profile.contactName,
          phone: profile.phone,
          homeRegion: profile.homeRegion,
          homeCountryCode: profile.homeCountryCode ?? null,
          homeRegionCode: profile.homeRegionCode ?? null,
          homeLatitude: profile.homeLatitude,
          homeLongitude: profile.homeLongitude,
          email: profile.email ?? user?.email ?? null,
        }
      : { firstName: null, lastName: null, email: user?.email ?? null },
  };
}

export async function saveV4RouterProfile(
  userId: string,
  body: V4RouterProfileInput,
  identity?: ClerkIdentity | null,
) {
  const now = new Date();
  const countryCode = normalizeCountryCode(body.homeCountryCode);
  const lat = body.homeLatitude;
  const lng = body.homeLongitude;
  const hasCoords = typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng);

  await db.transaction(async (tx) => {
    const userSet: Record<string, unknown> = {
      name: body.contactName,
      phone: body.phone,
      country: countryCode,
      countryCode: countryCode,
      stateCode: body.homeRegionCode,
      legalCity: body.homeRegion,
      legalCountry: countryCode,
      formattedAddress: body.homeRegion,
      updatedAt: now,
    };
    if (hasCoords) {
      (userSet as any).latitude = lat;
      (userSet as any).longitude = lng;
    }
    await tx.update(users).set(userSet as any).where(eq(users.id, userId));

    await tx
      .insert(routers)
      .values({
        userId,
        isActive: true,
        termsAccepted: true,
        profileComplete: true,
        homeCountry: countryCode as any,
        homeRegionCode: body.homeRegionCode,
        homeCity: body.homeRegion,
        status: "ACTIVE",
        createdAt: now,
      } as any)
      .onConflictDoUpdate({
        target: routers.userId,
        set: {
          isActive: true,
          termsAccepted: true,
          profileComplete: true,
          homeCountry: countryCode as any,
          homeRegionCode: body.homeRegionCode,
          homeCity: body.homeRegion,
          status: "ACTIVE",
        } as any,
      });

    const profileValues: Record<string, unknown> = {
      id: randomUUID(),
      userId,
      firstName: identity?.firstName ?? null,
      lastName: identity?.lastName ?? null,
      email: identity?.email ?? null,
      avatarUrl: identity?.avatarUrl ?? null,
      contactName: body.contactName,
      phone: body.phone,
      homeRegion: body.homeRegion,
      homeCountryCode: body.homeCountryCode,
      homeRegionCode: body.homeRegionCode,
      serviceAreas: [],
      availability: [],
      createdAt: now,
      updatedAt: now,
    };
    if (hasCoords) {
      profileValues.homeLatitude = lat;
      profileValues.homeLongitude = lng;
    } else {
      profileValues.homeLatitude = null;
      profileValues.homeLongitude = null;
    }
    const profileSet: Record<string, unknown> = {
      contactName: body.contactName,
      phone: body.phone,
      homeRegion: body.homeRegion,
      homeCountryCode: body.homeCountryCode,
      homeRegionCode: body.homeRegionCode,
      serviceAreas: [],
      availability: [],
      homeLatitude: hasCoords ? lat : null,
      homeLongitude: hasCoords ? lng : null,
      updatedAt: now,
    };
    await tx
      .insert(routerProfilesV4)
      .values(profileValues as any)
      .onConflictDoUpdate({
        target: routerProfilesV4.userId,
        set: profileSet as any,
      });
  });
}

export { V4RouterProfileSchema };
