import { NextResponse } from "next/server";
import { logEvent } from "@/src/server/observability/log";

/**
 * Deprecated Stripe webhook endpoint.
 *
 * Canonical handler is:
 * - /api/webhooks/stripe (apps/api/app/api/webhooks/stripe/route.ts)
 *
 * Keep this route to fail fast if something is still pointing at it.
 */
export async function POST(req: Request) {
  logEvent({
    level: "warn",
    event: "stripe.webhook_deprecated_endpoint_hit",
    route: "/api/stripe/webhook",
    method: "POST",
    status: 410,
    code: "DEPRECATED_ENDPOINT",
    context: { path: new URL(req.url).pathname },
  });
  return NextResponse.json(
    { ok: false, error: "This webhook endpoint is deprecated. Use /api/webhooks/stripe.", code: "DEPRECATED" },
    { status: 410 },
  );
}

