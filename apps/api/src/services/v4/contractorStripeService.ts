import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorAccounts } from "@/db/schema/contractorAccount";
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

export type ContractorPaymentSetupState = {
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  stripePayoutsEnabled: boolean;
  paymentSetupComplete: boolean;
};

type ContractorStripeIdentity = {
  userId: string;
  userCountry: "CA" | "US";
  userEmail: string | null;
  userPhone: string | null;
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

function toTruthyBool(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  const v = String(raw ?? "").trim().toLowerCase();
  return ["true", "t", "1", "yes", "on"].includes(v);
}

async function resolveContractorStripeIdentity(userId: string): Promise<ContractorStripeIdentity> {
  const userRows = await db
    .select({ email: users.email, phone: users.phone, country: users.country })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = userRows[0] ?? null;
  const userCountry = normalizeCountry(user?.country ?? null);
  const userPhone = String(user?.phone ?? "").trim() || null;

  const profileRows = await db
    .select({ userId: contractorProfilesV4.userId, email: contractorProfilesV4.email })
    .from(contractorProfilesV4)
    .where(eq(contractorProfilesV4.userId, userId))
    .limit(1);

  const profile = profileRows[0] ?? null;
  const lookupEmail =
    String(profile?.email ?? "").trim().toLowerCase() || String(user?.email ?? "").trim().toLowerCase() || null;

  const [contractorRows, accountRows, payoutMethodRows] = await Promise.all([
    lookupEmail
      ? db
          .select({
            id: contractors.id,
            stripeAccountId: contractors.stripeAccountId,
            stripePayoutsEnabled: contractors.stripePayoutsEnabled,
          })
          .from(contractors)
          .where(sql`lower(${contractors.email}) = ${lookupEmail}`)
          .limit(1)
      : Promise.resolve([] as Array<{ id: string; stripeAccountId: string | null; stripePayoutsEnabled: boolean }>),
    db
      .select({
        stripeAccountId: contractorAccounts.stripeAccountId,
        payoutStatus: contractorAccounts.payoutStatus,
      })
      .from(contractorAccounts)
      .where(eq(contractorAccounts.userId, userId))
      .limit(1),
    db
      .select({ details: payoutMethods.details })
      .from(payoutMethods)
      .where(and(eq(payoutMethods.userId, userId), eq(payoutMethods.provider, "STRIPE" as any), eq(payoutMethods.isActive, true)))
      .orderBy(desc(payoutMethods.createdAt))
      .limit(1),
  ]);

  const contractor = contractorRows[0] ?? null;
  const account = accountRows[0] ?? null;
  const payoutMethod = payoutMethodRows[0] ?? null;
  const payoutDetails = (payoutMethod?.details as Record<string, unknown> | null) ?? null;
  const payoutMethodStripeId = String(payoutDetails?.stripeAccountId ?? "").trim() || null;
  const payoutMethodPayoutsEnabled = toTruthyBool(payoutDetails?.stripePayoutsEnabled);
  const accountPayoutVerified = ["ACTIVE", "VERIFIED", "READY"].includes(
    String(account?.payoutStatus ?? "").toUpperCase(),
  );
  const resolvedStripeAccountId =
    String(contractor?.stripeAccountId ?? "").trim() ||
    String(account?.stripeAccountId ?? "").trim() ||
    payoutMethodStripeId ||
    null;
  const resolvedPayoutsEnabled =
    Boolean(contractor?.stripePayoutsEnabled) ||
    accountPayoutVerified ||
    payoutMethodPayoutsEnabled;

  return {
    userId,
    userCountry,
    userEmail: lookupEmail,
    userPhone,
    contractorId: contractor?.id ?? null,
    stripeAccountId: resolvedStripeAccountId,
    stripePayoutsEnabled: resolvedPayoutsEnabled,
  };
}

async function persistPayoutEnabled(args: {
  userId: string;
  contractorId: string | null;
  stripeAccountId: string;
  payoutsEnabled: boolean;
}) {
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
      .update(contractorAccounts)
      .set({
        stripeAccountId: args.stripeAccountId,
        payoutStatus: args.payoutsEnabled ? "VERIFIED" : "PENDING",
      } as any)
      .where(eq(contractorAccounts.userId, args.userId)),
  );

  operations.push(
    db
      .update(contractorProfilesV4)
      .set({
        stripeConnected: true,
        updatedAt: now,
      } as any)
      .where(eq(contractorProfilesV4.userId, args.userId)),
  );

  operations.push(
    db
      .update(payoutMethods)
      .set({
        details: sql`jsonb_set(
          jsonb_set(${payoutMethods.details}, '{stripeAccountId}', to_jsonb(${args.stripeAccountId}::text), true),
          '{stripePayoutsEnabled}',
          to_jsonb(${args.payoutsEnabled}::boolean),
          true
        )`,
        updatedAt: now,
      } as any)
      .where(
        and(
          eq(payoutMethods.userId, args.userId),
          eq(payoutMethods.provider, "STRIPE" as any),
          eq(payoutMethods.isActive, true),
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

  let account: Awaited<ReturnType<typeof stripe.accounts.retrieve>>;
  try {
    account = await stripe.accounts.retrieve(identity.stripeAccountId);
  } catch (err: unknown) {
    console.error("V4_CONTRACTOR_STRIPE_RETRIEVE_ERROR", {
      userId,
      stripeAccountId: identity.stripeAccountId,
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: true,
      state: "NOT_CONNECTED",
      stripeAccountId: null,
      chargesEnabled: false,
      payoutsEnabled: false,
      requirements: { currentlyDue: [], pastDue: [] },
    };
  }

  const chargesEnabled = Boolean(account.charges_enabled);
  const payoutsEnabled = Boolean(account.payouts_enabled);
  const currentlyDue = Array.isArray(account.requirements?.currently_due)
    ? account.requirements.currently_due.filter((v): v is string => typeof v === "string")
    : [];
  const pastDue = Array.isArray(account.requirements?.past_due)
    ? account.requirements.past_due.filter((v): v is string => typeof v === "string")
    : [];

  try {
    await persistPayoutEnabled({
      userId,
      contractorId: identity.contractorId,
      stripeAccountId: identity.stripeAccountId,
      payoutsEnabled,
    });
  } catch (err) {
    console.error("V4_CONTRACTOR_PERSIST_PAYOUT_ERROR", {
      userId,
      stripeAccountId: identity.stripeAccountId,
      message: err instanceof Error ? err.message : String(err),
    });
  }

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

  if (!identity.userEmail) {
    throw internal("V4_CONTRACTOR_PROFILE_MISSING", "Contractor profile missing");
  }

  const expectedCurrency = expectedCurrencyForCountry(identity.userCountry);

  let stripeAccountId = identity.stripeAccountId;
  if (!stripeAccountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: identity.userCountry,
      email: identity.userEmail,
      business_type: "individual",
      business_profile: {
        url: "https://8fold.app",
        product_description:
          "Marketplace contractor and routing services provided through the 8Fold platform",
      },
      ...(identity.userEmail || identity.userPhone
        ? {
            individual: {
              ...(identity.userEmail ? { email: identity.userEmail } : {}),
              ...(identity.userPhone ? { phone: identity.userPhone } : {}),
            },
          }
        : {}),
      capabilities: {
        transfers: { requested: true },
      },
      metadata: {
        userId,
        ...(identity.contractorId ? { contractorId: identity.contractorId } : {}),
        role: "CONTRACTOR",
        expectedCurrency,
      },
    });
    stripeAccountId = account.id;

    await db.transaction(async (tx) => {
      if (identity.contractorId) {
        await tx
          .update(contractors)
          .set({ stripeAccountId } as any)
          .where(eq(contractors.id, identity.contractorId));
      }
      await tx
        .update(contractorAccounts)
        .set({ stripeAccountId } as any)
        .where(eq(contractorAccounts.userId, userId));
      await tx
        .update(contractorProfilesV4)
        .set({ stripeConnected: true, updatedAt: new Date() } as any)
        .where(eq(contractorProfilesV4.userId, userId));
    });
  }

  const webOrigin = resolveWebOrigin();
  const returnUrl = `${webOrigin}/dashboard/contractor/payment`;

  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: returnUrl,
    return_url: returnUrl,
    type: "account_onboarding",
    collect: "eventually_due",
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

export async function getContractorPaymentSetupState(userId: string): Promise<ContractorPaymentSetupState> {
  const identity = await resolveContractorStripeIdentity(userId);
  const stripeAccountId = identity.stripeAccountId;
  if (!stripeAccountId) {
    return {
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      stripePayoutsEnabled: false,
      paymentSetupComplete: false,
    };
  }

  try {
    const status = await getContractorStripeStatus(userId);
    const stripeOnboardingComplete = status.state === "VERIFIED";
    const stripePayoutsEnabled = Boolean(status.payoutsEnabled);
    return {
      stripeAccountId: status.stripeAccountId,
      stripeOnboardingComplete,
      stripePayoutsEnabled,
      paymentSetupComplete: Boolean(status.stripeAccountId && stripeOnboardingComplete && stripePayoutsEnabled),
    };
  } catch {
    return {
      stripeAccountId,
      stripeOnboardingComplete: false,
      stripePayoutsEnabled: Boolean(identity.stripePayoutsEnabled),
      paymentSetupComplete: false,
    };
  }
}
