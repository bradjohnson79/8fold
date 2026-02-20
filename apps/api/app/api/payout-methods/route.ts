import { NextResponse } from "next/server";
import { requireUser } from "../../../src/auth/rbac";
import { toHttpError } from "../../../src/http/errors";
import { z } from "zod";
import { stripe as stripeClient } from "../../../src/payments/stripe";
import Stripe from "stripe";
import { and, desc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../../../db/drizzle";
import { auditLogs, contractorAccounts, jobPosterProfiles, payoutMethods, users } from "../../../db/schema";
import { logApiError } from "@/src/lib/errors/errorLogger";

const CurrencySchema = z.enum(["CAD", "USD"]);
const ProviderSchema = z.enum(["STRIPE"]);

const CreateSchema = z.object({
  currency: CurrencySchema,
  provider: ProviderSchema,
  details: z.record(z.any())
});

function requireStripe(): Stripe {
  if (!stripeClient) {
    throw Object.assign(new Error("Stripe not configured"), { status: 500 });
  }
  return stripeClient;
}

async function existingStripeAccountIdForUser(userId: string): Promise<string | null> {
  const [method, poster, contractor] = await Promise.all([
    db
      .select({ details: payoutMethods.details })
      .from(payoutMethods)
      .where(and(eq(payoutMethods.userId, userId), eq(payoutMethods.provider, "STRIPE" as any)))
      .orderBy(desc(payoutMethods.createdAt))
      .limit(1)
      .then((r) => r[0] ?? null),
    db
      .select({ stripeAccountId: jobPosterProfiles.stripeAccountId })
      .from(jobPosterProfiles)
      .where(eq(jobPosterProfiles.userId, userId))
      .limit(1)
      .then((r) => r[0] ?? null),
    db
      .select({ stripeAccountId: contractorAccounts.stripeAccountId })
      .from(contractorAccounts)
      .where(eq(contractorAccounts.userId, userId))
      .limit(1)
      .then((r) => r[0] ?? null),
  ]);
  const fromMethod = String((method?.details as any)?.stripeAccountId ?? "").trim();
  return fromMethod || poster?.stripeAccountId || contractor?.stripeAccountId || null;
}

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const methods = await db
      .select()
      .from(payoutMethods)
      .where(eq(payoutMethods.userId, user.userId))
      .orderBy(desc(payoutMethods.createdAt));
    return NextResponse.json({ payoutMethods: methods });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const body = CreateSchema.safeParse(raw);
    if (!body.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    // Country->currency lock (per spec)
    const uRow =
      (
        await db
          .select({ country: users.country })
          .from(users)
          .where(eq(users.id, user.userId))
          .limit(1)
      )[0] ?? null;
    const expectedCurrency = uRow?.country === "CA" ? "CAD" : "USD";
    if (body.data.currency !== expectedCurrency) {
      return NextResponse.json(
        { error: `Currency mismatch. Your account is ${uRow?.country ?? "US"}; expected ${expectedCurrency}.` },
        { status: 409 }
      );
    }

    // Keep role payout settings in sync (RouterProfile / JobPosterProfile / ContractorAccount).
    // No role auto-creation: we only update rows that already exist.

    // Provider-specific side effects
    let onboardingUrl: string | null = null;
    let stripeAccountId: string | null = null;

    if (body.data.provider === "STRIPE") {
      const s = requireStripe();
      stripeAccountId = await existingStripeAccountIdForUser(user.userId);

      // Create Express account only if missing everywhere (preserve existing IDs).
      if (!stripeAccountId) {
        const userRow =
          (
            await db
              .select({ email: users.email, country: users.country })
              .from(users)
              .where(eq(users.id, user.userId))
              .limit(1)
          )[0] ?? null;
        const acct = await s.accounts.create({
          type: "express",
          email: userRow?.email ?? undefined,
          capabilities: { transfers: { requested: true } },
          metadata: { userId: user.userId },
        });
        stripeAccountId = acct.id;
      }

      await db.transaction(async (tx) => {
        // Only set stripeAccountId if currently null (never overwrite).
        await tx
          .update(jobPosterProfiles)
          .set({ stripeAccountId, payoutMethod: "STRIPE" as any, payoutStatus: "PENDING" as any })
          .where(and(eq(jobPosterProfiles.userId, user.userId), isNull(jobPosterProfiles.stripeAccountId)));
        await tx
          .update(contractorAccounts)
          .set({ stripeAccountId, payoutMethod: "STRIPE", payoutStatus: "PENDING" })
          .where(and(eq(contractorAccounts.userId, user.userId), isNull(contractorAccounts.stripeAccountId)));
      });

      const base = String(process.env.WEB_BASE_URL ?? "http://localhost:3006").replace(/\/+$/, "");
      const returnUrl = `${base}/app/payouts/stripe/return`;
      const refreshUrl = `${base}/app/payouts/stripe/refresh`;
      const link = await s.accountLinks.create({
        account: stripeAccountId,
        type: "account_onboarding",
        return_url: returnUrl,
        refresh_url: refreshUrl,
      });
      onboardingUrl = link.url;
    }

    const created = await db.transaction(async (tx) => {
      const now = new Date();
      // One active payout method per currency: deactivate existing
      await tx
        .update(payoutMethods)
        .set({ isActive: false, updatedAt: now })
        .where(and(eq(payoutMethods.userId, user.userId), eq(payoutMethods.currency, body.data.currency as any), eq(payoutMethods.isActive, true)));

      const methodId = randomUUID();
      const method =
        (
          await tx
            .insert(payoutMethods)
            .values({
              id: methodId,
              userId: user.userId,
              currency: body.data.currency as any,
              provider: body.data.provider as any,
              isActive: true,
              details: {
                ...body.data.details,
                ...(stripeAccountId ? { stripeAccountId } : {}),
              } as any,
              updatedAt: now,
            })
            .returning()
        )[0]!;

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: user.userId,
        action: "PAYOUT_METHOD_SET",
        entityType: "PayoutMethod",
        entityId: method.id,
        metadata: { currency: body.data.currency, provider: body.data.provider } as any,
      });
      return method;
    });

    return NextResponse.json({ payoutMethod: created, onboardingUrl }, { status: 201 });
  } catch (err) {
    logApiError({ context: "POST /api/payout-methods", err });
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

