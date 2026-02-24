import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { routerProfilesV4 } from "@/db/schema/routerProfileV4";
import { users } from "@/db/schema/user";
import { type V4RouterProfileInput, V4RouterProfileSchema } from "@/src/validation/v4/routerProfileSchema";

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
          contactName: profile.contactName,
          phone: profile.phone,
          homeRegion: profile.homeRegion,
          serviceAreas: Array.isArray(profile.serviceAreas) ? profile.serviceAreas : [],
          availability: Array.isArray(profile.availability) ? profile.availability : [],
          homeLatitude: profile.homeLatitude,
          homeLongitude: profile.homeLongitude,
          email: user?.email ?? null,
        }
      : { email: user?.email ?? null },
  };
}

export async function saveV4RouterProfile(userId: string, body: V4RouterProfileInput) {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        phone: body.phone,
        latitude: body.homeLatitude as any,
        longitude: body.homeLongitude as any,
        updatedAt: now,
      } as any)
      .where(eq(users.id, userId));

    await tx
      .insert(routerProfilesV4)
      .values({
        id: randomUUID(),
        userId,
        contactName: body.contactName,
        phone: body.phone,
        homeRegion: body.homeRegion,
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
