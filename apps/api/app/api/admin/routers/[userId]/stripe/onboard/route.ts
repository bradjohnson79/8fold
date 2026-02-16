import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { stripe } from "@/src/stripe/stripe";
import { db } from "@/db/drizzle";
import { routerProfiles } from "@/db/schema/routerProfile";
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

    const rows = await db
      .select({ id: routerProfiles.id, stripeAccountId: routerProfiles.stripeAccountId })
      .from(routerProfiles)
      .where(eq(routerProfiles.userId, userId))
      .limit(1);
    const rp = rows[0] ?? null;
    if (!rp) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    let accountId = rp.stripeAccountId ? String(rp.stripeAccountId) : "";
    if (!accountId) {
      const acct = await s.accounts.create({
        type: "express",
        metadata: { type: "router", userId },
      });
      accountId = acct.id;
      await db.update(routerProfiles).set({ stripeAccountId: accountId } as any).where(eq(routerProfiles.id, rp.id));
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

