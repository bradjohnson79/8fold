import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorAccounts } from "@/db/schema/contractorAccount";
import { jobPosterProfilesV4 } from "@/db/schema/jobPosterProfileV4";
import { payoutMethods } from "@/db/schema/payoutMethod";
import { routerProfilesV4 } from "@/db/schema/routerProfileV4";
import { users } from "@/db/schema/user";
import { getContractorPaymentSetupState } from "@/src/services/v4/contractorStripeService";
import { hasCurrentRoleTermsAcceptance, type CompletionRole } from "@/src/services/v4/roleTermsService";

export type CompletionStep = "TERMS" | "PROFILE" | "PAYMENT";

export type RoleCompletion = {
  role: CompletionRole;
  terms: boolean;
  profile: boolean;
  payment: boolean;
  complete: boolean;
  missing: CompletionStep[];
};

export type RoleCompletionSnapshot = {
  role: CompletionRole | null;
  hasAcceptedJobPosterTerms: boolean;
  hasCompletedJobPosterProfile: boolean;
  hasCompletedJobPosterPaymentSetup: boolean;
  hasAcceptedContractorTerms: boolean;
  hasCompletedContractorProfile: boolean;
  hasCompletedContractorPaymentSetup: boolean;
  contractorPaymentSetupComplete: boolean;
  contractorStripeAccountId: string | null;
  contractorStripeOnboardingComplete: boolean;
  contractorStripePayoutsEnabled: boolean;
  hasAcceptedRouterTerms: boolean;
  hasCompletedRouterProfile: boolean;
  hasCompletedRouterPaymentSetup: boolean;
  roleCompletion: RoleCompletion | null;
};

function normalizeRole(raw: unknown): CompletionRole | null {
  const role = String(raw ?? "").trim().toUpperCase();
  if (role === "JOB_POSTER" || role === "CONTRACTOR" || role === "ROUTER") return role;
  return null;
}

function parseTruthy(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  const value = String(raw ?? "").trim().toLowerCase();
  return value === "true" || value === "1" || value === "t" || value === "yes" || value === "on";
}

function buildRoleCompletion(role: CompletionRole, terms: boolean, profile: boolean, payment: boolean): RoleCompletion {
  const missing: CompletionStep[] = [];
  if (!terms) missing.push("TERMS");
  if (!profile) missing.push("PROFILE");
  if (!payment) missing.push("PAYMENT");

  return {
    role,
    terms,
    profile,
    payment,
    complete: missing.length === 0,
    missing,
  };
}

function hasJobPosterAddressAndMap(profile: {
  addressLine1: string | null;
  city: string | null;
  provinceState: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
} | null): boolean {
  if (!profile) return false;
  const hasAddress = Boolean(
    profile.addressLine1?.trim() &&
      profile.city?.trim() &&
      profile.provinceState?.trim() &&
      profile.country?.trim(),
  );
  const hasMap =
    Number.isFinite(profile.latitude) &&
    Number.isFinite(profile.longitude) &&
    !(profile.latitude === 0 && profile.longitude === 0);
  return hasAddress && hasMap;
}

function hasRouterProfileRequiredFields(profile: {
  serviceAreas: unknown;
  availability: unknown;
  homeLatitude?: number | null;
  homeLongitude?: number | null;
  phone: string;
  homeRegion: string;
  homeCountryCode: string | null;
  homeRegionCode: string | null;
} | null): boolean {
  if (!profile) return false;
  return Boolean(
    profile.phone?.trim() &&
      profile.homeRegion?.trim() &&
      profile.homeCountryCode?.trim() &&
      profile.homeRegionCode?.trim(),
  );
}

export async function getRoleCompletionSnapshot(userId: string, roleHint?: string | null): Promise<RoleCompletionSnapshot> {
  const [userRows, contractorRows, jobPosterRows, routerRows, stripePayoutRows, contractorPaymentSetup] = await Promise.all([
    db
      .select({
        role: users.role,
        stripeStatus: users.stripeStatus,
        stripeDefaultPaymentMethodId: users.stripeDefaultPaymentMethodId,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({
        wizardCompleted: contractorAccounts.wizardCompleted,
        isActive: contractorAccounts.isActive,
        waiverAccepted: contractorAccounts.waiverAccepted,
        waiverAcceptedAt: contractorAccounts.waiverAcceptedAt,
      })
      .from(contractorAccounts)
      .where(eq(contractorAccounts.userId, userId))
      .limit(1),
    db
      .select({
        addressLine1: jobPosterProfilesV4.addressLine1,
        city: jobPosterProfilesV4.city,
        provinceState: jobPosterProfilesV4.provinceState,
        country: jobPosterProfilesV4.country,
        latitude: jobPosterProfilesV4.latitude,
        longitude: jobPosterProfilesV4.longitude,
      })
      .from(jobPosterProfilesV4)
      .where(eq(jobPosterProfilesV4.userId, userId))
      .limit(1),
    db
      .select({
        serviceAreas: routerProfilesV4.serviceAreas,
        availability: routerProfilesV4.availability,
        homeLatitude: routerProfilesV4.homeLatitude,
        homeLongitude: routerProfilesV4.homeLongitude,
        phone: routerProfilesV4.phone,
        homeRegion: routerProfilesV4.homeRegion,
        homeCountryCode: routerProfilesV4.homeCountryCode,
        homeRegionCode: routerProfilesV4.homeRegionCode,
      })
      .from(routerProfilesV4)
      .where(eq(routerProfilesV4.userId, userId))
      .limit(1),
    db
      .select({
        details: payoutMethods.details,
      })
      .from(payoutMethods)
      .where(and(eq(payoutMethods.userId, userId), eq(payoutMethods.provider, "STRIPE" as any), eq(payoutMethods.isActive, true)))
      .orderBy(desc(payoutMethods.createdAt))
      .limit(1),
    getContractorPaymentSetupState(userId),
  ]);

  const user = userRows[0] ?? null;
  const contractor = contractorRows[0] ?? null;
  const poster = jobPosterRows[0] ?? null;
  const router = routerRows[0] ?? null;
  const stripeMethodDetails = (stripePayoutRows[0]?.details as Record<string, unknown> | null) ?? null;

  const role = normalizeRole(roleHint ?? user?.role ?? null);

  const hasAcceptedJobPosterTerms = await hasCurrentRoleTermsAcceptance(userId, "JOB_POSTER");
  const hasAcceptedRouterTerms = await hasCurrentRoleTermsAcceptance(userId, "ROUTER");
  const hasAcceptedContractorTerms = Boolean(
    (await hasCurrentRoleTermsAcceptance(userId, "CONTRACTOR")) &&
      contractor?.waiverAccepted === true &&
      contractor?.waiverAcceptedAt != null,
  );

  const hasCompletedJobPosterProfile = hasJobPosterAddressAndMap(poster);
  const hasCompletedContractorProfile = Boolean(contractor && contractor.wizardCompleted === true && contractor.isActive === true);
  const hasCompletedRouterProfile = hasRouterProfileRequiredFields(router);

  const hasCompletedJobPosterPaymentSetup = Boolean(
    String(user?.stripeStatus ?? "").trim().toUpperCase() === "CONNECTED" &&
      String(user?.stripeDefaultPaymentMethodId ?? "").trim().length > 0,
  );
  const hasCompletedContractorPaymentSetup = contractorPaymentSetup.paymentSetupComplete;
  const hasCompletedRouterPaymentSetup = Boolean(
    String(stripeMethodDetails?.stripeAccountId ?? "").trim().length > 0 &&
      (parseTruthy(stripeMethodDetails?.stripePayoutsEnabled) || parseTruthy(stripeMethodDetails?.stripeSimulatedApproved)),
  );

  const roleCompletion =
    role === "JOB_POSTER"
      ? buildRoleCompletion(
          "JOB_POSTER",
          hasAcceptedJobPosterTerms,
          hasCompletedJobPosterProfile,
          hasCompletedJobPosterPaymentSetup,
        )
      : role === "CONTRACTOR"
        ? buildRoleCompletion(
            "CONTRACTOR",
            hasAcceptedContractorTerms,
            hasCompletedContractorProfile,
            hasCompletedContractorPaymentSetup,
          )
        : role === "ROUTER"
          ? buildRoleCompletion("ROUTER", hasAcceptedRouterTerms, hasCompletedRouterProfile, hasCompletedRouterPaymentSetup)
          : null;

  return {
    role,
    hasAcceptedJobPosterTerms,
    hasCompletedJobPosterProfile,
    hasCompletedJobPosterPaymentSetup,
    hasAcceptedContractorTerms,
    hasCompletedContractorProfile,
    hasCompletedContractorPaymentSetup,
    contractorPaymentSetupComplete: contractorPaymentSetup.paymentSetupComplete,
    contractorStripeAccountId: contractorPaymentSetup.stripeAccountId,
    contractorStripeOnboardingComplete: contractorPaymentSetup.stripeOnboardingComplete,
    contractorStripePayoutsEnabled: contractorPaymentSetup.stripePayoutsEnabled,
    hasAcceptedRouterTerms,
    hasCompletedRouterProfile,
    hasCompletedRouterPaymentSetup,
    roleCompletion,
  };
}

export async function getRoleCompletion(userId: string, role: CompletionRole): Promise<RoleCompletion> {
  const snapshot = await getRoleCompletionSnapshot(userId, role);
  return snapshot.roleCompletion ?? buildRoleCompletion(role, false, false, false);
}
