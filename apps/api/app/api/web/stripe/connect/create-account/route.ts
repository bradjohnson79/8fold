import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { requireUser } from "../../../../../../src/auth/rbac";
import { stripe } from "../../../../../../src/stripe/stripe";
import { db } from "../../../../../../db/drizzle";
import { users } from "../../../../../../db/schema/user";
import { payoutMethods } from "../../../../../../db/schema/payoutMethod";
import { getWebOrigin } from "../../../../../../src/server/bootConfig";
import {
  isStripeSimulationEnabled,
  expectedCurrencyForCountry,
  getUserCountryForSim,
  getExistingStripeAccountId,
  persistStripeAccountForUser,
  markSimulatedApproval,
} from "../../../../../../src/services/v4/stripeSimulationService";

type UserCountry = "CA" | "US";
type StripeAccountTypeChoice = "AUTO" | "INDIVIDUAL" | "COMPANY";

function expectedCurrencyForStripeCountry(country: string): "CAD" | "USD" | null {
  const c = String(country ?? "").trim().toUpperCase();
  if (c === "CA") return "CAD";
  if (c === "US") return "USD";
  return null;
}

// Alias for backward compatibility within this file
const getUserCountry = (userId: string, role: "ROUTER" | "CONTRACTOR") =>
  getUserCountryForSim(userId, role);

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

function parseAccountTypeChoice(value: unknown): StripeAccountTypeChoice {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "individual" || raw === "personal") return "INDIVIDUAL";
  if (raw === "company" || raw === "business") return "COMPANY";
  return "AUTO";
}
async function getStripeMethodDetails(userId: string): Promise<Record<string, unknown> | null> {
  const method = await db
    .select({ details: payoutMethods.details })
    .from(payoutMethods)
    .where(and(eq(payoutMethods.userId, userId), eq(payoutMethods.provider, "STRIPE" as any)))
    .orderBy(desc(payoutMethods.createdAt))
    .limit(1)
    .then((rows: any[]) => rows[0] ?? null);
  return (method?.details as Record<string, unknown>) ?? null;
}


async function buildStatus(args: { userId: string; role: "ROUTER" | "CONTRACTOR" }) {
  const simulationEnabled = isStripeSimulationEnabled();
  const country = await getUserCountry(args.userId, args.role);
  const expectedCurrency = expectedCurrencyForCountry(country);
  const methodDetails = await getStripeMethodDetails(args.userId);
  const simulatedApproved = Boolean((methodDetails as any)?.stripeSimulatedApproved);
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
      simulationEnabled,
      simulatedApproved: false,
    };
  }
  if (simulatedApproved) {
    return {
      ok: true,
      state: "CONNECTED" as const,
      stripeAccountId,
      expectedCountry: country,
      payoutCurrency: expectedCurrency,
      accountCountry: country,
      countryMismatch: false,
      currencyMismatch: false,
      chargesEnabled: true,
      payoutsEnabled: true,
      onboardingComplete: true,
      role: args.role,
      simulationEnabled,
      simulatedApproved: true,
    };
  }
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  let account: Awaited<ReturnType<typeof stripe.accounts.retrieve>>;
  try {
    account = await stripe.accounts.retrieve(stripeAccountId);
  } catch (err) {
    console.error("STRIPE_ACCOUNT_RETRIEVE_ERROR", {
      userId: args.userId,
      stripeAccountId,
      message: err instanceof Error ? err.message : String(err),
    });
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
      simulationEnabled,
      simulatedApproved: false,
    };
  }

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
    simulationEnabled,
    simulatedApproved: false,
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
    if (status.payoutsEnabled && status.stripeAccountId) {
      persistStripeAccountForUser({
        userId: user.userId,
        stripeAccountId: status.stripeAccountId,
        expectedCurrency: status.payoutCurrency as "CAD" | "USD",
        stripePayoutsEnabled: true,
      }).catch(() => {});
    }
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

    const simulationEnabled = isStripeSimulationEnabled();
    const body = (await req.json().catch(() => ({}))) as { accountType?: string; simulateApproved?: boolean };
    const accountTypeChoice = parseAccountTypeChoice(body?.accountType);
    const simulateApproved = Boolean(body?.simulateApproved);
    const typedRole = role as "ROUTER" | "CONTRACTOR";
    const country = await getUserCountry(user.userId, typedRole);
    const expectedCurrency = expectedCurrencyForCountry(country);
    const userInfo = await db
      .select({ email: users.email, phone: users.phone })
      .from(users)
      .where(eq(users.id, user.userId))
      .limit(1)
      .then((rows) => rows[0] ?? null);
    const userEmail = String(userInfo?.email ?? "").trim() || null;
    const userPhone = String(userInfo?.phone ?? "").trim() || null;
    const existing = await getExistingStripeAccountId(user.userId);

    if (simulateApproved) {
      if (!simulationEnabled) {
        return NextResponse.json({ error: "Simulation mode is disabled." }, { status: 403 });
      }
      const safeUserId = user.userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20) || "user";
      const simulatedAccountId = existing || `sim_${typedRole.toLowerCase()}_${safeUserId}`;
      await markSimulatedApproval({
        userId: user.userId,
        role: typedRole,
        stripeAccountId: simulatedAccountId,
        expectedCurrency,
      });
      return NextResponse.json({
        ok: true,
        state: "CONNECTED",
        stripeAccountId: simulatedAccountId,
        payoutCurrency: expectedCurrency,
        chargesEnabled: true,
        payoutsEnabled: true,
        onboardingComplete: true,
        simulationEnabled,
        simulatedApproved: true,
      });
    }

    if (!stripe) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
    }

    let stripeAccountId = existing;
    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country,
        business_type: accountTypeChoice === "AUTO"
          ? "individual"
          : accountTypeChoice.toLowerCase() as "individual" | "company",
        business_profile: {
          url: "https://8fold.app",
          product_description:
            "Marketplace contractor and routing services provided through the 8Fold platform",
        },
        ...(userEmail || userPhone
          ? {
              individual: {
                ...(userEmail ? { email: userEmail } : {}),
                ...(userPhone ? { phone: userPhone } : {}),
              },
            }
          : {}),
        capabilities: requestedCapabilitiesForCountry(country),
        metadata: {
          userId: user.userId,
          role: typedRole,
          expectedCurrency,
          accountTypeChoice,
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
    const baseUrl = getWebOrigin();
    const profilePath =
      role === "ROUTER" ? "/dashboard/stripe/return?role=ROUTER" : "/dashboard/stripe/return?role=CONTRACTOR";
    const profileUrl = `${baseUrl}${profilePath}`;

    if (onboardingComplete) {
      await persistStripeAccountForUser({
        userId: user.userId,
        stripeAccountId,
        expectedCurrency,
        stripePayoutsEnabled: true,
      });
      const loginLink = await stripe.accounts.createLoginLink(stripeAccountId);
      return NextResponse.json({
        ok: true,
        state: "CONNECTED",
        stripeAccountId,
        url: loginLink.url,
        payoutCurrency: expectedCurrency,
        chargesEnabled: Boolean(account.charges_enabled),
        payoutsEnabled: Boolean(account.payouts_enabled),
        simulationEnabled,
        simulatedApproved: false,
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: profileUrl,
      return_url: profileUrl,
      type: "account_onboarding",
      collect: "eventually_due",
    });
    return NextResponse.json({
      ok: true,
      state: existing ? "PENDING_VERIFICATION" : "NOT_CONNECTED",
      stripeAccountId,
      url: accountLink.url,
      payoutCurrency: expectedCurrency,
      chargesEnabled: Boolean(account.charges_enabled),
      payoutsEnabled: Boolean(account.payouts_enabled),
      simulationEnabled,
      simulatedApproved: false,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
