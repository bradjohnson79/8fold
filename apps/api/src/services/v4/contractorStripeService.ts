import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractors } from "@/db/schema/contractor";
import { contractorProfilesV4 } from "@/db/schema/contractorProfileV4";
import { payoutMethods } from "@/db/schema/payoutMethod";
import { users } from "@/db/schema/user";
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

async function resolveContractorStripeIdentity(userId: string): Promise<ContractorStripeIdentity> {
  const userRows = await db
    .select({ email: users.email, country: users.country })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = userRows[0] ?? null;
  const userCountry = normalizeCountry(user?.country ?? null);

  const profileRows = await db
    .select({ userId: contractorProfilesV4.userId, email: contractorProfilesV4.email })
    .from(contractorProfilesV4)
    .where(eq(contractorProfilesV4.userId, userId))
    .limit(1);

  const profile = profileRows[0] ?? null;
  const lookupEmail =
    String(profile?.email ?? "").trim().toLowerCase() || String(user?.email ?? "").trim().toLowerCase() || null;

  if (!lookupEmail) {
    return {
      userId,
      userCountry,
      userEmail: null,
      contractorId: null,
      stripeAccountId: null,
      stripePayoutsEnabled: false,
    };
  }

  const contractorRows = await db
    .select({
      id: contractors.id,
      stripeAccountId: contractors.stripeAccountId,
      stripePayoutsEnabled: contractors.stripePayoutsEnabled,
    })
    .from(contractors)
    .where(sql`lower(${contractors.email}) = ${lookupEmail}`)
    .limit(1);

  const contractor = contractorRows[0] ?? null;

  return {
    userId,
    userCountry,
    userEmail: lookupEmail,
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
  console.log("Session:", { userId });
  console.log("Looking for contractor with:", {
    contractorProfileUserId: userId,
    lookupEmail: identity.userEmail,
  });
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
