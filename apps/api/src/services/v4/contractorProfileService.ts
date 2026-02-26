import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorProfilesV4 } from "@/db/schema/contractorProfileV4";
import { users } from "@/db/schema/user";
import { type V4ContractorProfileInput } from "@/src/validation/v4/contractorProfileSchema";
import { forbidden } from "@/src/services/v4/v4Errors";
import type { ClerkIdentity } from "@/src/auth/getClerkIdentity";

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
          firstName: profile.firstName ?? null,
          lastName: profile.lastName ?? null,
          contactName: profile.contactName,
          phone: profile.phone,
          businessName: profile.businessName,
          businessNumber: profile.businessNumber ?? null,
          startedTradeYear: profile.startedTradeYear ?? null,
          startedTradeMonth: profile.startedTradeMonth ?? null,
          acceptedTosAt: profile.acceptedTosAt ? profile.acceptedTosAt.toISOString() : null,
          tosVersion: profile.tosVersion ?? null,
          streetAddress: profile.streetAddress ?? null,
          formattedAddress: profile.formattedAddress ?? null,
          yearsExperience: profile.yearsExperience ?? null,
          city: profile.city ?? null,
          postalCode: profile.postalCode ?? null,
          countryCode: profile.countryCode ?? null,
          tradeCategories: Array.isArray(profile.tradeCategories) ? profile.tradeCategories : [],
          homeLatitude: profile.homeLatitude,
          homeLongitude: profile.homeLongitude,
          email: profile.email ?? user?.email ?? null,
        }
      : { firstName: null, lastName: null, email: user?.email ?? null },
  };
}

function computeSuspendedUntil(startedTradeYear: number, startedTradeMonth: number) {
  return new Date(Date.UTC(startedTradeYear + 3, startedTradeMonth - 1, 1));
}

function hasMinimumThreeYearsExperience(startedTradeYear: number, startedTradeMonth: number, now = new Date()) {
  return computeSuspendedUntil(startedTradeYear, startedTradeMonth).getTime() <= now.getTime();
}

export async function upsertV4ContractorProfile(
  userId: string,
  input: V4ContractorProfileInput,
  identity?: ClerkIdentity | null,
) {
  const now = new Date();
  if (!hasMinimumThreeYearsExperience(input.startedTradeYear, input.startedTradeMonth, now)) {
    const suspendedUntil = computeSuspendedUntil(input.startedTradeYear, input.startedTradeMonth);
    await db
      .update(users)
      .set({
        status: "SUSPENDED" as any,
        accountStatus: "SUSPENDED",
        suspendedUntil,
        suspensionReason: "Minimum 3 years of trade experience required.",
        updatedAt: now,
      } as any)
      .where(eq(users.id, userId));

    throw forbidden(
      "V4_CONTRACTOR_EXPERIENCE_SUSPENDED",
      `Minimum 3 years of trade experience is required. Account suspended until ${suspendedUntil.toISOString().slice(0, 10)}.`,
    );
  }

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
        firstName: identity?.firstName ?? null,
        lastName: identity?.lastName ?? null,
        email: identity?.email ?? null,
        avatarUrl: identity?.avatarUrl ?? null,
        contactName: input.contactName,
        phone: input.phone,
        businessName: input.businessName,
        businessNumber: input.businessNumber ?? null,
        startedTradeYear: input.startedTradeYear,
        startedTradeMonth: input.startedTradeMonth,
        acceptedTosAt: now,
        tosVersion: input.tosVersion,
        streetAddress: input.streetAddress,
        formattedAddress: input.formattedAddress,
        city: input.city,
        postalCode: input.postalCode,
        countryCode: input.countryCode,
        yearsExperience: now.getUTCFullYear() - input.startedTradeYear,
        tradeCategories: input.tradeCategories as any,
        serviceRadiusKm: 25,
        homeLatitude: input.homeLatitude,
        homeLongitude: input.homeLongitude,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: contractorProfilesV4.userId,
        set: {
          contactName: input.contactName,
          phone: input.phone,
          businessName: input.businessName,
          businessNumber: input.businessNumber ?? null,
          startedTradeYear: input.startedTradeYear,
          startedTradeMonth: input.startedTradeMonth,
          acceptedTosAt: now,
          tosVersion: input.tosVersion,
          streetAddress: input.streetAddress,
          formattedAddress: input.formattedAddress,
          city: input.city,
          postalCode: input.postalCode,
          countryCode: input.countryCode,
          yearsExperience: now.getUTCFullYear() - input.startedTradeYear,
          tradeCategories: input.tradeCategories as any,
          serviceRadiusKm: 25,
          homeLatitude: input.homeLatitude,
          homeLongitude: input.homeLongitude,
          updatedAt: now,
          // Identity: backfill on first save only; do NOT update on conflict
        },
      });
  });
}
