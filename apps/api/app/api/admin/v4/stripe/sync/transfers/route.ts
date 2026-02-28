import { requireAdminTier } from "@/src/adminBus";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { rateLimitOrThrow } from "@/src/services/v4/rateLimitService";
import { syncStripeTransfersOnly } from "@/src/services/stripeGateway/stripeSyncService";

export const dynamic = "force-dynamic";

function parseDate(raw: unknown): Date | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function POST(req: Request) {
  const authed = await requireAdminTier(req, "ADMIN_SUPER");
  if (authed instanceof Response) return authed;

  try {
    await rateLimitOrThrow({
      key: `admin:v4:stripe:sync:transfers:${authed.adminId}`,
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
    const body = await req.json().catch(() => ({}));
    const to = parseDate(body?.to) ?? new Date();
    const from = parseDate(body?.from) ?? new Date(to.getTime() - 24 * 60 * 60 * 1000);
    if (from.getTime() > to.getTime()) {
      return err(400, "ADMIN_V4_STRIPE_SYNC_TRANSFERS_INVALID", "Provide valid `from` and `to` timestamps.");
    }
    const result = await syncStripeTransfersOnly({ from, to, triggeredBy: authed.email });
    return ok(result, 200);
  } catch (error) {
    return err(500, "ADMIN_V4_STRIPE_SYNC_TRANSFERS_FAILED", error instanceof Error ? error.message : "Sync failed");
  }
}
