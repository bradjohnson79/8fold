import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/db/drizzle";
import { contractorAccounts } from "@/db/schema/contractorAccount";
import { payoutMethods } from "@/db/schema/payoutMethod";
import { users } from "@/db/schema/user";
import { stripe } from "@/src/stripe/stripe";
import { getBaseUrl } from "@/src/lib/getBaseUrl";

export type StripeConnectRole = "CONTRACTOR" | "ROUTER";
type UserCountry = "CA" | "US";

export type StripeConnectStatus = {
  ok: true;
  state: "NOT_CONNECTED" | "PENDING_VERIFICATION" | "CONNECTED" | "CURRENCY_MISMATCH";
  stripeAccountId: string | null;
  expectedCountry: UserCountry;
  payoutCurrency: "CAD" | "USD";
  accountCountry?: string | null;
  countryMismatch: boolean;
  currencyMismatch: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  onboardingComplete: boolean;
  role?: string;
};

function expectedCurrencyForCountry(country: UserCountry): "CAD" | "USD" {
  return country === "CA" ? "CAD" : "USD";
}

function expectedCurrencyForStripeCountry(country: string): "CAD" | "USD" | null {
  const c = String(country ?? "").trim().toUpperCase();
  if (c === "CA") return "CAD";
  if (c === "US") return "USD";
  return null;
}

async function getUserCountry(userId: string): Promise<UserCountry> {
  const row = await db
    .select({ country: users.country })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const c = String(row[0]?.country ?? "US").trim().toUpperCase();
  return c === "CA" ? "CA" : "US";
}

async function getExistingStripeAccountId(userId: string): Promise<string | null> {
  const [method, contractor] = await Promise.all([
    db
      .select({ details: payoutMethods.details })
      .from(payoutMethods)
      .where(and(eq(payoutMethods.userId, userId), eq(payoutMethods.provider, "STRIPE" as any)))
      .orderBy(desc(payoutMethods.createdAt))
      .limit(1)
      .then((r: any[]) => r[0] ?? null),
    db
      .select({ stripeAccountId: contractorAccounts.stripeAccountId })
      .from(contractorAccounts)
      .where(eq(contractorAccounts.userId, userId))
      .limit(1)
      .then((r: any[]) => r[0] ?? null),
  ]);

  const fromMethod = String((method?.details as any)?.stripeAccountId ?? "").trim();
  return fromMethod || String(contractor?.stripeAccountId ?? "").trim() || null;
}

async function persistStripeAccountForUser(args: {
  userId: string;
  stripeAccountId: string;
  expectedCurrency: "CAD" | "USD";
}) {
  const now = new Date();
  await db.transaction(async (tx: any) => {
    const existingMethod = await tx
      .select({ id: payoutMethods.id, details: payoutMethods.details, isActive: payoutMethods.isActive })
      .from(payoutMethods)
      .where(
        and(
          eq(payoutMethods.userId, args.userId),
          eq(payoutMethods.provider, "STRIPE" as any),
          eq(payoutMethods.currency, args.expectedCurrency as any),
        ),
      )
      .orderBy(desc(payoutMethods.createdAt))
      .limit(1);
    const method = existingMethod[0] ?? null;

    if (!method?.id) {
      await tx.insert(payoutMethods).values({
        id: randomUUID(),
        userId: args.userId,
        currency: args.expectedCurrency as any,
        provider: "STRIPE" as any,
        isActive: true,
        details: { stripeAccountId: args.stripeAccountId } as any,
        updatedAt: now,
      });
    } else {
      await tx
        .update(payoutMethods)
        .set({
          details: { ...(method.details as any), stripeAccountId: args.stripeAccountId } as any,
          isActive: true,
          updatedAt: now,
        })
        .where(eq(payoutMethods.id, method.id));
    }

    await tx
      .update(contractorAccounts)
      .set({ stripeAccountId: args.stripeAccountId } as any)
      .where(eq(contractorAccounts.userId, args.userId));
  });
}

export async function getStripeConnectStatus(args: { userId: string; role: StripeConnectRole }): Promise<StripeConnectStatus> {
  const country = await getUserCountry(args.userId);
  const expectedCurrency = expectedCurrencyForCountry(country);
  const stripeAccountId = await getExistingStripeAccountId(args.userId);

  if (!stripeAccountId) {
    return {
      ok: true,
      state: "NOT_CONNECTED",
      stripeAccountId: null,
      expectedCountry: country,
      payoutCurrency: expectedCurrency,
      countryMismatch: false,
      currencyMismatch: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      onboardingComplete: false,
      role: args.role,
    };
  }

  if (!stripe) {
    throw new Error("Stripe not configured");
  }

  const account = await stripe.accounts.retrieve(stripeAccountId);
  const accountCountry = String(account.country ?? "").trim().toUpperCase();
  const accountCurrency = expectedCurrencyForStripeCountry(accountCountry);
  const countryMismatch = accountCountry !== country;
  const currencyMismatch = !accountCurrency || accountCurrency !== expectedCurrency;
  const chargesEnabled = Boolean(account.charges_enabled);
  const payoutsEnabled = Boolean(account.payouts_enabled);
  const onboardingComplete = Boolean(account.details_submitted) && chargesEnabled && payoutsEnabled;

  const mismatch = countryMismatch || currencyMismatch;

  return {
    ok: true,
    state: mismatch ? "CURRENCY_MISMATCH" : onboardingComplete ? "CONNECTED" : "PENDING_VERIFICATION",
    stripeAccountId,
    expectedCountry: country,
    payoutCurrency: expectedCurrency,
    accountCountry: accountCountry || null,
    countryMismatch,
    currencyMismatch,
    chargesEnabled,
    payoutsEnabled,
    onboardingComplete,
    role: args.role,
  };
}

export async function createOrRefreshStripeConnectOnboarding(args: {
  userId: string;
  role: StripeConnectRole;
}): Promise<
  | {
      ok: true;
      state: "CONNECTED" | "PENDING_VERIFICATION" | "NOT_CONNECTED";
      stripeAccountId: string;
      url: string;
      payoutCurrency: "CAD" | "USD";
      chargesEnabled: boolean;
      payoutsEnabled: boolean;
    }
  | {
      ok: true;
      state: "CURRENCY_MISMATCH";
      stripeAccountId: string;
      expectedCountry: UserCountry;
      payoutCurrency: "CAD" | "USD";
      accountCountry: string | null;
      countryMismatch: boolean;
      currencyMismatch: boolean;
      message: string;
    }
> {
  if (!stripe) {
    throw new Error("Stripe not configured");
  }

  const country = await getUserCountry(args.userId);
  const expectedCurrency = expectedCurrencyForCountry(country);
  const existing = await getExistingStripeAccountId(args.userId);

  let stripeAccountId = existing;
  if (!stripeAccountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country,
      capabilities: { transfers: { requested: true } },
      metadata: {
        userId: args.userId,
        role: args.role,
        expectedCurrency,
      },
    });
    stripeAccountId = account.id;
    await persistStripeAccountForUser({ userId: args.userId, stripeAccountId, expectedCurrency });
  }

  if (!stripeAccountId) {
    throw new Error("Unable to initialize Stripe account");
  }

  const account = await stripe.accounts.retrieve(stripeAccountId);
  const accountCountry = String(account.country ?? "").trim().toUpperCase();
  const accountCurrency = expectedCurrencyForStripeCountry(accountCountry);
  const countryMismatch = accountCountry !== country;
  const currencyMismatch = !accountCurrency || accountCurrency !== expectedCurrency;
  if (countryMismatch || currencyMismatch) {
    return {
      ok: true,
      state: "CURRENCY_MISMATCH",
      stripeAccountId,
      expectedCountry: country,
      payoutCurrency: expectedCurrency,
      accountCountry: accountCountry || null,
      countryMismatch,
      currencyMismatch: true,
      message: "Currency mismatch detected. Contact support.",
    };
  }

  const onboardingComplete = Boolean(account.details_submitted) && Boolean(account.charges_enabled) && Boolean(account.payouts_enabled);
  const baseUrl = getBaseUrl();
  const profilePath = args.role === "ROUTER" ? "/app/router/profile" : "/app/contractor/profile";
  const profileUrl = `${baseUrl}${profilePath}`;

  if (onboardingComplete) {
    const loginLink = await stripe.accounts.createLoginLink(stripeAccountId);
    return {
      ok: true,
      state: "CONNECTED",
      stripeAccountId,
      url: loginLink.url,
      payoutCurrency: expectedCurrency,
      chargesEnabled: Boolean(account.charges_enabled),
      payoutsEnabled: Boolean(account.payouts_enabled),
    };
  }

  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: profileUrl,
    return_url: profileUrl,
    type: "account_onboarding",
  });

  return {
    ok: true,
    state: existing ? "PENDING_VERIFICATION" : "NOT_CONNECTED",
    stripeAccountId,
    url: accountLink.url,
    payoutCurrency: expectedCurrency,
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
  };
}

export async function isContractorStripeConnectReady(userId: string): Promise<boolean> {
  try {
    const status = await getStripeConnectStatus({ userId, role: "CONTRACTOR" });
    return status.state === "CONNECTED";
  } catch {
    return false;
  }
}
