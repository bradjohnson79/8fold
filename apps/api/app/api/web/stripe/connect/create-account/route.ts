import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireUser } from "../../../../../../src/auth/rbac";
import { stripe } from "../../../../../../src/stripe/stripe";
import { db } from "../../../../../../db/drizzle";
import { users } from "../../../../../../db/schema/user";
import { payoutMethods } from "../../../../../../db/schema/payoutMethod";
import { contractorAccounts } from "../../../../../../db/schema/contractorAccount";
import { contractorProfilesV4 } from "../../../../../../db/schema/contractorProfileV4";
import { routerProfilesV4 } from "../../../../../../db/schema/routerProfileV4";
import { getBaseUrl } from "../../../../../../src/lib/getBaseUrl";

type UserCountry = "CA" | "US";

function expectedCurrencyForCountry(country: UserCountry): "CAD" | "USD" {
  return country === "CA" ? "CAD" : "USD";
}

function expectedCurrencyForStripeCountry(country: string): "CAD" | "USD" | null {
  const c = String(country ?? "").trim().toUpperCase();
  if (c === "CA") return "CAD";
  if (c === "US") return "USD";
  return null;
}

function normalizeUserCountry(raw: string | null | undefined): UserCountry {
  const c = String(raw ?? "").trim().toUpperCase();
  return c === "CA" ? "CA" : "US";
}

async function getUserCountry(userId: string, role: "ROUTER" | "CONTRACTOR"): Promise<UserCountry> {
  const [userRow, roleRow] = await Promise.all([
    db
      .select({ country: users.country })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    role === "ROUTER"
      ? db
          .select({ countryCode: routerProfilesV4.homeCountryCode })
          .from(routerProfilesV4)
          .where(eq(routerProfilesV4.userId, userId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : db
          .select({ countryCode: contractorProfilesV4.countryCode })
          .from(contractorProfilesV4)
          .where(eq(contractorProfilesV4.userId, userId))
          .limit(1)
          .then((rows) => rows[0] ?? null),
  ]);

  // Prefer role profile country first so Stripe account country follows the setup address country.
  return normalizeUserCountry(roleRow?.countryCode ?? userRow?.country ?? "US");
}

function requestedCapabilitiesForCountry(country: UserCountry): {
  transfers: { requested: true };
  card_payments?: { requested: true };
} {
  if (country === "US") {
    // Stripe requires card_payments + transfers together for US connected accounts.
    return {
      transfers: { requested: true },
      card_payments: { requested: true },
    };
  }
  return { transfers: { requested: true } };
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

async function buildStatus(args: { userId: string; role: "ROUTER" | "CONTRACTOR" }) {
  const country = await getUserCountry(args.userId, args.role);
  const expectedCurrency = expectedCurrencyForCountry(country);
  const stripeAccountId = await getExistingStripeAccountId(args.userId);
  if (!stripeAccountId) {
    return {
      ok: true,
      state: "NOT_CONNECTED" as const,
      stripeAccountId: null,
      expectedCountry: country,
      payoutCurrency: expectedCurrency,
      countryMismatch: false,
      currencyMismatch: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      onboardingComplete: false,
    };
  }
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
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
    state: mismatch
      ? ("CURRENCY_MISMATCH" as const)
      : onboardingComplete
        ? ("CONNECTED" as const)
        : ("PENDING_VERIFICATION" as const),
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

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const role = String(user.role ?? "").toUpperCase();
    if (role !== "ROUTER" && role !== "CONTRACTOR") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const status = await buildStatus({ userId: user.userId, role: role as "ROUTER" | "CONTRACTOR" });
    if (status instanceof NextResponse) return status;
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const role = String(user.role ?? "").toUpperCase();
    if (role !== "ROUTER" && role !== "CONTRACTOR") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!stripe) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
    }

    const typedRole = role as "ROUTER" | "CONTRACTOR";
    const country = await getUserCountry(user.userId, typedRole);
    const expectedCurrency = expectedCurrencyForCountry(country);
    const existing = await getExistingStripeAccountId(user.userId);

    let stripeAccountId = existing;
    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country,
        capabilities: requestedCapabilitiesForCountry(country),
        metadata: {
          userId: user.userId,
          role: typedRole,
          expectedCurrency,
        },
      });
      stripeAccountId = account.id;
      await persistStripeAccountForUser({ userId: user.userId, stripeAccountId, expectedCurrency });
    }
    if (!stripeAccountId) {
      return NextResponse.json({ error: "Unable to initialize Stripe account" }, { status: 500 });
    }

    const account = await stripe.accounts.retrieve(stripeAccountId);
    const accountCountry = String(account.country ?? "").trim().toUpperCase();
    const accountCurrency = expectedCurrencyForStripeCountry(accountCountry);
    const countryMismatch = accountCountry !== country;
    const currencyMismatch = !accountCurrency || accountCurrency !== expectedCurrency;
    if (countryMismatch || currencyMismatch) {
      return NextResponse.json(
        {
          ok: true,
          state: "CURRENCY_MISMATCH",
          stripeAccountId,
          expectedCountry: country,
          payoutCurrency: expectedCurrency,
          accountCountry: accountCountry || null,
          countryMismatch,
          currencyMismatch: true,
          message: "Currency mismatch detected. Contact support.",
        },
        { status: 409 },
      );
    }

    const onboardingComplete = Boolean(account.details_submitted) && Boolean(account.charges_enabled) && Boolean(account.payouts_enabled);
    const baseUrl = getBaseUrl();
    const profilePath =
      role === "ROUTER"
        ? "/dashboard/router/payment?stripe=return"
        : "/dashboard/contractor/payment?stripe=return";
    const profileUrl = `${baseUrl}${profilePath}`;

    if (onboardingComplete) {
      const loginLink = await stripe.accounts.createLoginLink(stripeAccountId);
      return NextResponse.json({
        ok: true,
        state: "CONNECTED",
        stripeAccountId,
        url: loginLink.url,
        payoutCurrency: expectedCurrency,
        chargesEnabled: Boolean(account.charges_enabled),
        payoutsEnabled: Boolean(account.payouts_enabled),
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: profileUrl,
      return_url: profileUrl,
      type: "account_onboarding",
    });
    return NextResponse.json({
      ok: true,
      state: existing ? "PENDING_VERIFICATION" : "NOT_CONNECTED",
      stripeAccountId,
      url: accountLink.url,
      payoutCurrency: expectedCurrency,
      chargesEnabled: Boolean(account.charges_enabled),
      payoutsEnabled: Boolean(account.payouts_enabled),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
