import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { stripe } from "@/src/stripe/stripe";
import { db } from "@/db/drizzle";
import { payoutMethods } from "@/db/schema/payoutMethod";
import { users } from "@/db/schema/user";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";

function requireStripe() {
  if (!stripe) throw Object.assign(new Error("Stripe not configured"), { status: 500 });
  return stripe;
}

function requireUrl(name: "STRIPE_RETURN_URL" | "STRIPE_REFRESH_URL"): string {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw Object.assign(new Error(`${name} not configured`), { status: 500 });
  return v;
}

function getUserIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../routers/:userId/stripe/onboard
  return parts[parts.length - 3] ?? "";
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const userId = getUserIdFromUrl(req);
    if (!userId) return NextResponse.json({ ok: false, error: "Invalid router userId" }, { status: 400 });

    const s = requireStripe();
    const refreshUrl = requireUrl("STRIPE_REFRESH_URL");
    const returnUrl = requireUrl("STRIPE_RETURN_URL");

    const [pm, userRow] = await Promise.all([
      db
        .select({ details: payoutMethods.details })
        .from(payoutMethods)
        .where(and(eq(payoutMethods.userId, userId), eq(payoutMethods.provider, "STRIPE" as any)))
        .orderBy(desc(payoutMethods.createdAt))
        .limit(1)
        .then((r) => r[0] ?? null),
      db
        .select({ country: users.country, email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .then((r) => r[0] ?? null),
    ]);

    const currency = String(userRow?.country ?? "US").toUpperCase() === "CA" ? "CAD" : "USD";
    let accountId = String((pm?.details as any)?.stripeAccountId ?? "").trim();

    if (!accountId) {
      const acct = await s.accounts.create({
        type: "express",
        email: userRow?.email ?? undefined,
        capabilities: { transfers: { requested: true } },
        metadata: { type: "router", userId },
      });
      accountId = acct.id;

      const now = new Date();
      await db.transaction(async (tx) => {
        // One active payout method per currency: deactivate existing
        await tx
          .update(payoutMethods)
          .set({ isActive: false, updatedAt: now })
          .where(and(eq(payoutMethods.userId, userId), eq(payoutMethods.currency, currency as any), eq(payoutMethods.isActive, true)));

        await tx.insert(payoutMethods).values({
          id: crypto.randomUUID(),
          userId,
          currency: currency as any,
          provider: "STRIPE" as any,
          isActive: true,
          details: { stripeAccountId: accountId } as any,
          updatedAt: now,
        } as any);
      });
    }

    const link = await s.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: refreshUrl,
      return_url: returnUrl,
    });

    return NextResponse.json({ ok: true, data: { url: link.url } });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/routers/[userId]/stripe/onboard");
  }
}

