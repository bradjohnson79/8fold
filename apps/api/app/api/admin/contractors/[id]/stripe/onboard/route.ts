import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { stripe } from "@/src/stripe/stripe";
import { db } from "@/db/drizzle";
import { contractors } from "@/db/schema/contractor";
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

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  return parts[parts.length - 3] ?? "";
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const contractorId = getIdFromUrl(req);
    if (!contractorId) return NextResponse.json({ ok: false, error: "Invalid contractor id" }, { status: 400 });

    const s = requireStripe();
    const refreshUrl = requireUrl("STRIPE_REFRESH_URL");
    const returnUrl = requireUrl("STRIPE_RETURN_URL");

    const rows = await db
      .select({ id: contractors.id, stripeAccountId: contractors.stripeAccountId, email: contractors.email, country: contractors.country })
      .from(contractors)
      .where(eq(contractors.id, contractorId))
      .limit(1);
    const c = rows[0] ?? null;
    if (!c) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    let accountId = c.stripeAccountId ? String(c.stripeAccountId) : "";
    if (!accountId) {
      const acct = await s.accounts.create({
        type: "express",
        email: typeof c.email === "string" ? c.email : undefined,
        country: String(c.country ?? "CA") === "US" ? "US" : "CA",
        metadata: { type: "contractor", contractorId },
      });
      accountId = acct.id;
      await db.update(contractors).set({ stripeAccountId: accountId } as any).where(eq(contractors.id, contractorId));
    }

    const link = await s.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: refreshUrl,
      return_url: returnUrl,
    });

    return NextResponse.json({ ok: true, data: { url: link.url } });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/contractors/[id]/stripe/onboard");
  }
}

