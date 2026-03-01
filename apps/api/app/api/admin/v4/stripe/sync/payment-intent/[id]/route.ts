import { requireAdminTier } from "@/src/adminBus";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { rateLimitOrThrow } from "@/src/services/v4/rateLimitService";
import { syncSinglePaymentIntent } from "@/src/services/stripeGateway/stripeSyncService";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminTier(req, "ADMIN_SUPER");
  if (authed instanceof Response) return authed;

  try {
    await rateLimitOrThrow({
      key: `admin:v4:stripe:sync:payment-intent:${authed.adminId}`,
      windowSeconds: 10,
      max: 1,
    });
  } catch (e: any) {
    const retryAfter = Number(e?.details?.retryAfterSeconds ?? 10);
    return new Response(JSON.stringify({ ok: false, error: { code: "RATE_LIMITED", message: "Too many requests" } }), {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(Math.max(1, retryAfter)),
      },
    });
  }

  try {
    const { id } = await ctx.params;
    const paymentIntentId = String(id ?? "").trim();
    if (!paymentIntentId) {
      return err(400, "ADMIN_V4_STRIPE_SYNC_PAYMENT_INTENT_INVALID", "Payment intent id is required.");
    }
    const result = await syncSinglePaymentIntent(paymentIntentId, { triggeredBy: authed.email });
    return ok(result, 200);
  } catch (error) {
    return err(
      500,
      "ADMIN_V4_STRIPE_SYNC_PAYMENT_INTENT_FAILED",
      error instanceof Error ? error.message : "Sync payment intent failed",
    );
  }
}
