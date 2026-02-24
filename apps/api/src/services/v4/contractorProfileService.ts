import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorProfilesV4 } from "@/db/schema/contractorProfileV4";
import { users } from "@/db/schema/user";
import { type V4ContractorProfileInput } from "@/src/validation/v4/contractorProfileSchema";

export async function getV4ContractorProfile(userId: string) {
  const [profileRows, userRows] = await Promise.all([
    db.select().from(contractorProfilesV4).where(eq(contractorProfilesV4.userId, userId)).limit(1),
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
          businessName: profile.businessName,
          tradeCategories: Array.isArray(profile.tradeCategories) ? profile.tradeCategories : [],
          serviceRadiusKm: profile.serviceRadiusKm,
          homeLatitude: profile.homeLatitude,
          homeLongitude: profile.homeLongitude,
          stripeConnected: profile.stripeConnected,
          email: user?.email ?? null,
        }
      : { email: user?.email ?? null },
  };
}

export async function upsertV4ContractorProfile(userId: string, input: V4ContractorProfileInput) {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ phone: input.phone, updatedAt: now } as any)
      .where(eq(users.id, userId));

    await tx
      .insert(contractorProfilesV4)
      .values({
        id: randomUUID(),
        userId,
        contactName: input.contactName,
        phone: input.phone,
        businessName: input.businessName,
        tradeCategories: input.tradeCategories as any,
        serviceRadiusKm: input.serviceRadiusKm,
        homeLatitude: input.homeLatitude,
        homeLongitude: input.homeLongitude,
        stripeConnected: input.stripeConnected,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: contractorProfilesV4.userId,
        set: {
          contactName: input.contactName,
          phone: input.phone,
          businessName: input.businessName,
          tradeCategories: input.tradeCategories as any,
          serviceRadiusKm: input.serviceRadiusKm,
          homeLatitude: input.homeLatitude,
          homeLongitude: input.homeLongitude,
          stripeConnected: input.stripeConnected,
          updatedAt: now,
        },
      });
  });
}
