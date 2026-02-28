import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorAccounts } from "@/db/schema/contractorAccount";
import { contractorProfilesV4 } from "@/db/schema/contractorProfileV4";
import { users } from "@/db/schema/user";
import { recordRoleTermsAcceptance } from "@/src/services/v4/roleTermsService";
import { type V4ContractorProfileInput } from "@/src/validation/v4/contractorProfileSchema";
import { badRequest, conflict, forbidden, internal, type V4Error } from "@/src/services/v4/v4Errors";
import type { ClerkIdentity } from "@/src/auth/getClerkIdentity";

function normalizeCountryCode(raw: string | null | undefined): "US" | "CA" {
  return String(raw ?? "").trim().toUpperCase() === "CA" ? "CA" : "US";
}

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

function mapContractorProfileDbError(err: unknown): V4Error {
  const cause = (err as any)?.cause ?? err;
  const pgCode = String((cause as any)?.code ?? "");

  if (pgCode === "23502") {
    return badRequest(
      "V4_CONTRACTOR_PROFILE_REQUIRED_FIELD_MISSING",
      "One or more required contractor profile fields are missing.",
      { column: (cause as any)?.column ?? null },
    );
  }

  if (pgCode === "23503") {
    return conflict(
      "V4_CONTRACTOR_PROFILE_USER_LINK_INVALID",
      "Contractor account link is invalid. Please refresh and try again.",
      { constraint: (cause as any)?.constraint ?? null },
    );
  }

  if (pgCode === "23505") {
    return conflict(
      "V4_CONTRACTOR_PROFILE_CONFLICT",
      "A conflicting contractor profile record exists. Please retry.",
      { constraint: (cause as any)?.constraint ?? null },
    );
  }

  if (pgCode === "22P02" || pgCode === "22003") {
    return badRequest("V4_CONTRACTOR_PROFILE_INVALID_DATA", "Invalid contractor profile values provided.");
  }

  return internal("V4_CONTRACTOR_PROFILE_SAVE_FAILED");
}

export async function upsertV4ContractorProfile(
  userId: string,
  input: V4ContractorProfileInput,
  identity?: ClerkIdentity | null,
) {
  const now = new Date();
  const countryCode = normalizeCountryCode(input.countryCode);
  const contactParts = String(input.contactName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const firstName = contactParts[0] ?? identity?.firstName ?? null;
  const lastName = contactParts.slice(1).join(" ") || identity?.lastName || null;

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

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          name: input.contactName,
          phone: input.phone,
          formattedAddress: input.formattedAddress,
          latitude: input.homeLatitude as any,
          longitude: input.homeLongitude as any,
          legalStreet: input.streetAddress,
          legalCity: input.city,
          legalPostalCode: input.postalCode,
          legalCountry: countryCode,
          country: countryCode as any,
          countryCode: countryCode as any,
          updatedAt: now,
        } as any)
        .where(eq(users.id, userId));

      await tx
        .insert(contractorAccounts)
        .values({
          userId,
          firstName,
          lastName,
          businessName: input.businessName,
          businessNumber: input.businessNumber ?? null,
          address1: input.streetAddress,
          postalCode: input.postalCode,
          tradeCategory: input.tradeCategories[0] ?? null,
          country: countryCode as any,
          city: input.city,
          tradeStartYear: input.startedTradeYear,
          tradeStartMonth: input.startedTradeMonth,
          waiverAccepted: true,
          waiverAcceptedAt: now as any,
          wizardCompleted: true,
          isActive: true,
          createdAt: now,
        } as any)
        .onConflictDoUpdate({
          target: contractorAccounts.userId,
          set: {
            firstName,
            lastName,
            businessName: input.businessName,
            businessNumber: input.businessNumber ?? null,
            address1: input.streetAddress,
            postalCode: input.postalCode,
            tradeCategory: input.tradeCategories[0] ?? null,
            country: countryCode as any,
            city: input.city,
            tradeStartYear: input.startedTradeYear,
            tradeStartMonth: input.startedTradeMonth,
            waiverAccepted: true,
            waiverAcceptedAt: now as any,
            wizardCompleted: true,
            isActive: true,
          } as any,
        });

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
    await recordRoleTermsAcceptance({
      userId,
      role: "CONTRACTOR",
      version: input.tosVersion,
      acceptedAt: now,
    });
    console.log("Contractor saved:", userId);
  } catch (err) {
    throw mapContractorProfileDbError(err);
  }
}
