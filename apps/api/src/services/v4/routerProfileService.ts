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
          serviceAreas: Array.isArray(profile.serviceAreas) ? profile.serviceAreas : [],
          availability: Array.isArray(profile.availability) ? profile.availability : [],
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
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        name: body.contactName,
        phone: body.phone,
        country: countryCode as any,
        countryCode: countryCode as any,
        stateCode: body.homeRegionCode,
        legalCity: body.homeRegion,
        legalCountry: countryCode,
        formattedAddress: body.homeRegion,
        latitude: body.homeLatitude as any,
        longitude: body.homeLongitude as any,
        updatedAt: now,
      } as any)
      .where(eq(users.id, userId));

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

    await tx
      .insert(routerProfilesV4)
      .values({
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
        serviceAreas: body.serviceAreas as any,
        availability: body.availability as any,
        homeLatitude: body.homeLatitude,
        homeLongitude: body.homeLongitude,
        createdAt: now,
        updatedAt: now,
      } as any)
      .onConflictDoUpdate({
        target: routerProfilesV4.userId,
        set: {
          contactName: body.contactName,
          phone: body.phone,
          homeRegion: body.homeRegion,
          homeCountryCode: body.homeCountryCode,
          homeRegionCode: body.homeRegionCode,
          serviceAreas: body.serviceAreas as any,
          availability: body.availability as any,
          homeLatitude: body.homeLatitude,
          homeLongitude: body.homeLongitude,
          updatedAt: now,
        } as any,
      });
  });
}

export { V4RouterProfileSchema };
