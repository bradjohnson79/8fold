import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractors } from "@/db/schema/contractor";
import { contractorProfilesV4 } from "@/db/schema/contractorProfileV4";
import { payoutMethods } from "@/db/schema/payoutMethod";
import { users } from "@/db/schema/user";
import { tradeEnumToCategoryKey } from "@/src/contractors/tradeMap";
import { stripe } from "@/src/stripe/stripe";
import { internal } from "@/src/services/v4/v4Errors";

export type ContractorStripeStatus = {
  ok: true;
  state: "VERIFIED" | "PENDING_VERIFICATION" | "NOT_CONNECTED";
  stripeAccountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirements: {
    currentlyDue: string[];
    pastDue: string[];
  };
};

type ContractorStripeIdentity = {
  userId: string;
  userCountry: "CA" | "US";
  userEmail: string | null;
  contractorId: string | null;
  stripeAccountId: string | null;
  stripePayoutsEnabled: boolean;
};

function normalizeCountry(raw: string | null | undefined): "CA" | "US" {
  const country = String(raw ?? "").trim().toUpperCase();
  return country === "CA" ? "CA" : "US";
}

function resolveWebOrigin(): string {
  const raw = String(process.env.WEB_ORIGIN ?? "").trim();
  if (!raw) {
    if (String(process.env.NODE_ENV ?? "").toLowerCase() !== "development") {
      throw internal("V4_WEB_ORIGIN_MISSING", "WEB_ORIGIN is not configured.");
    }
    throw internal("V4_WEB_ORIGIN_MISSING", "WEB_ORIGIN is not configured for local development.");
  }
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(candidate).origin;
  } catch {
    throw internal("V4_WEB_ORIGIN_INVALID", "WEB_ORIGIN is invalid.");
  }
}

function expectedCurrencyForCountry(country: "CA" | "US"): "CAD" | "USD" {
  return country === "CA" ? "CAD" : "USD";
}

function normalizeRegionCode(raw: string | null | undefined, country: "CA" | "US"): string {
  const input = String(raw ?? "").trim().toUpperCase();
  if (!input) return country;
  if (input.length <= 8) return input;
  return input.slice(0, 8);
}

function mapTradeCategoriesToTrade(raw: unknown): string {
  const categories = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
  const primary = String(categories[0] ?? "").toUpperCase();
  switch (primary) {
    case "PLUMBING":
      return "PLUMBING";
    case "ELECTRICAL":
      return "ELECTRICAL";
    case "DRYWALL":
      return "DRYWALL";
    case "ROOFING":
      return "ROOFING";
    case "CARPENTRY":
      return "CARPENTRY";
    case "JUNK_REMOVAL":
      return "JUNK_REMOVAL";
    case "LANDSCAPING":
    case "SNOW_REMOVAL":
    case "FENCING":
      return "YARDWORK_GROUNDSKEEPING";
    default:
      return "CARPENTRY";
  }
}

function normalizeTradeCategories(raw: unknown): string[] {
  const allowed = new Set([
    "PLUMBING",
    "ELECTRICAL",
    "HVAC",
    "APPLIANCE",
    "HANDYMAN",
    "PAINTING",
    "CARPENTRY",
    "DRYWALL",
    "ROOFING",
    "JANITORIAL_CLEANING",
    "LANDSCAPING",
    "FENCING",
    "SNOW_REMOVAL",
    "JUNK_REMOVAL",
    "MOVING",
    "AUTOMOTIVE",
    "FURNITURE_ASSEMBLY",
  ]);
  const categories = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
  const normalized = categories
    .map((v) => v.trim().toUpperCase())
    .filter((v) => allowed.has(v));
  return normalized.length > 0 ? normalized : ["HANDYMAN"];
}

async function ensureContractorRecordForUser(args: {
  userId: string;
  userEmail: string;
  userCountry: "CA" | "US";
}): Promise<{ id: string; stripeAccountId: string | null; stripePayoutsEnabled: boolean } | null> {
  const existingRows = await db
    .select({
      id: contractors.id,
      stripeAccountId: contractors.stripeAccountId,
      stripePayoutsEnabled: contractors.stripePayoutsEnabled,
    })
    .from(contractors)
    .where(sql`lower(${contractors.email}) = ${args.userEmail}`)
    .limit(1);

  const existing = existingRows[0] ?? null;
  if (existing) return existing;

  const profileRows = await db
    .select({
      contactName: contractorProfilesV4.contactName,
      phone: contractorProfilesV4.phone,
      businessName: contractorProfilesV4.businessName,
      yearsExperience: contractorProfilesV4.yearsExperience,
      city: contractorProfilesV4.city,
      countryCode: contractorProfilesV4.countryCode,
      tradeCategories: contractorProfilesV4.tradeCategories,
      homeLatitude: contractorProfilesV4.homeLatitude,
      homeLongitude: contractorProfilesV4.homeLongitude,
    })
    .from(contractorProfilesV4)
    .where(eq(contractorProfilesV4.userId, args.userId))
    .limit(1);

  const profile = profileRows[0] ?? null;
  if (!profile) return null;

  const trade = mapTradeCategoriesToTrade(profile.tradeCategories);
  const tradeCategories = normalizeTradeCategories(profile.tradeCategories);
  const country = normalizeCountry(profile.countryCode ?? args.userCountry);
  const regionCode = normalizeRegionCode(profile.city ?? null, country);
  const contractorId = randomUUID();

  const inserted = await db
    .insert(contractors)
    .values({
      id: contractorId,
      status: "PENDING",
      businessName: String(profile.businessName ?? "").trim() || "Contractor",
      contactName: String(profile.contactName ?? "").trim() || null,
      yearsExperience: Number(profile.yearsExperience ?? 3),
      phone: String(profile.phone ?? "").trim() || null,
      email: args.userEmail,
      country: country as any,
      regionCode,
      trade: trade as any,
      categories: [tradeEnumToCategoryKey(trade)],
      tradeCategories: tradeCategories as any,
      lat: profile.homeLatitude ?? null,
      lng: profile.homeLongitude ?? null,
      regions: regionCode ? [regionCode.toLowerCase()] : [],
      createdAt: new Date(),
    } as any)
    .returning({
      id: contractors.id,
      stripeAccountId: contractors.stripeAccountId,
      stripePayoutsEnabled: contractors.stripePayoutsEnabled,
    });

  return inserted[0] ?? null;
}

async function resolveContractorStripeIdentity(userId: string): Promise<ContractorStripeIdentity> {
  const userRows = await db
    .select({ email: users.email, country: users.country })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = userRows[0] ?? null;
  const userEmail = String(user?.email ?? "").trim().toLowerCase() || null;
  const userCountry = normalizeCountry(user?.country ?? null);

  if (!userEmail) {
    return {
      userId,
      userCountry,
      userEmail: null,
      contractorId: null,
      stripeAccountId: null,
      stripePayoutsEnabled: false,
    };
  }

  const contractor = await ensureContractorRecordForUser({
    userId,
    userEmail,
    userCountry,
  });

  return {
    userId,
    userCountry,
    userEmail,
    contractorId: contractor?.id ?? null,
    stripeAccountId: String(contractor?.stripeAccountId ?? "").trim() || null,
    stripePayoutsEnabled: Boolean(contractor?.stripePayoutsEnabled),
  };
}

async function persistPayoutEnabled(args: { contractorId: string | null; stripeAccountId: string; payoutsEnabled: boolean }) {
  const now = new Date();
  const operations: Promise<unknown>[] = [];

  if (args.contractorId) {
    operations.push(
      db
        .update(contractors)
        .set({ stripePayoutsEnabled: args.payoutsEnabled } as any)
        .where(eq(contractors.id, args.contractorId)),
    );
  }

  operations.push(
    db
      .update(payoutMethods)
      .set({
        details: sql`jsonb_set(${payoutMethods.details}, '{stripePayoutsEnabled}', to_jsonb(${args.payoutsEnabled}), true)`,
        updatedAt: now,
      } as any)
      .where(
        and(
          eq(payoutMethods.provider, "STRIPE" as any),
          sql`${payoutMethods.details} ->> 'stripeAccountId' = ${args.stripeAccountId}`,
        ),
      ),
  );

  await Promise.all(operations);
}

export async function getContractorStripeStatus(userId: string): Promise<ContractorStripeStatus> {
  const identity = await resolveContractorStripeIdentity(userId);

  if (!identity.stripeAccountId) {
    return {
      ok: true,
      state: "NOT_CONNECTED",
      stripeAccountId: null,
      chargesEnabled: false,
      payoutsEnabled: false,
      requirements: {
        currentlyDue: [],
        pastDue: [],
      },
    };
  }

  if (!stripe) {
    throw internal("V4_STRIPE_NOT_CONFIGURED", "Stripe is not configured.");
  }

  const account = await stripe.accounts.retrieve(identity.stripeAccountId);
  const chargesEnabled = Boolean(account.charges_enabled);
  const payoutsEnabled = Boolean(account.payouts_enabled);
  const currentlyDue = Array.isArray(account.requirements?.currently_due)
    ? account.requirements.currently_due.filter((v): v is string => typeof v === "string")
    : [];
  const pastDue = Array.isArray(account.requirements?.past_due)
    ? account.requirements.past_due.filter((v): v is string => typeof v === "string")
    : [];

  await persistPayoutEnabled({
    contractorId: identity.contractorId,
    stripeAccountId: identity.stripeAccountId,
    payoutsEnabled,
  });

  return {
    ok: true,
    state: chargesEnabled && payoutsEnabled ? "VERIFIED" : "PENDING_VERIFICATION",
    stripeAccountId: identity.stripeAccountId,
    chargesEnabled,
    payoutsEnabled,
    requirements: {
      currentlyDue,
      pastDue,
    },
  };
}

export async function createOrRefreshContractorOnboardingLink(userId: string): Promise<{ ok: true; url: string }> {
  if (!stripe) {
    throw internal("V4_STRIPE_NOT_CONFIGURED", "Stripe is not configured.");
  }

  const identity = await resolveContractorStripeIdentity(userId);
  // Temporary diagnostic log for contractor-user linkage verification.
  console.log("Session user id:", userId);
  console.log("Contractor record:", {
    contractorId: identity.contractorId,
    userEmail: identity.userEmail,
    stripeAccountId: identity.stripeAccountId,
    stripePayoutsEnabled: identity.stripePayoutsEnabled,
  });

  if (!identity.contractorId || !identity.userEmail) {
    throw internal("V4_CONTRACTOR_PROFILE_MISSING", "Contractor profile missing");
  }

  const expectedCurrency = expectedCurrencyForCountry(identity.userCountry);

  let stripeAccountId = identity.stripeAccountId;
  if (!stripeAccountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: identity.userCountry,
      email: identity.userEmail,
      capabilities: {
        transfers: { requested: true },
      },
      metadata: {
        userId,
        contractorId: identity.contractorId,
        role: "CONTRACTOR",
        expectedCurrency,
      },
    });
    stripeAccountId = account.id;

    await db
      .update(contractors)
      .set({ stripeAccountId } as any)
      .where(eq(contractors.id, identity.contractorId));
  }

  const webOrigin = resolveWebOrigin();
  const returnUrl = `${webOrigin}/dashboard/contractor/payment`;

  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: returnUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });

  return { ok: true, url: accountLink.url };
}

export async function isContractorStripeVerifiedForJobAcceptance(userId: string): Promise<boolean> {
  try {
    const status = await getContractorStripeStatus(userId);
    return status.state === "VERIFIED";
  } catch {
    return false;
  }
}

export async function getContractorStripeSnapshot(userId: string): Promise<boolean> {
  const identity = await resolveContractorStripeIdentity(userId);
  return Boolean(identity.stripeAccountId) && Boolean(identity.stripePayoutsEnabled);
}
