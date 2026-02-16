import { NextResponse } from "next/server";
import crypto from "node:crypto";
import "@/server/commands/stripeWebhookHandlers";
import { bus } from "@/server/bus/bus";
import { BusError } from "@/server/bus/errors";

export const runtime = "nodejs";

// Webhooks must not be cached.
export const dynamic = "force-dynamic";

/**
 * Stripe webhooks are handled authoritatively by the backend (`apps/api`).
 * This web-app route is a thin proxy to avoid double-processing and to keep the web app Prisma-free.
 */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });

  const raw = await req.arrayBuffer();
  try {
    const requestId = crypto.randomUUID();
    const out = await bus.dispatch({
      type: "stripe.webhook.handle",
      payload: { signature: sig, bodyBase64: Buffer.from(raw).toString("base64") },
      context: { requestId, now: new Date() },
    });
    return NextResponse.json(out, { status: 200 });
  } catch (e) {
    const status =
      typeof (e as any)?.status === "number" ? (e as any).status : e instanceof BusError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

