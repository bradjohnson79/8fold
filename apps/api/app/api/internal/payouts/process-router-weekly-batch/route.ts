import { NextResponse } from "next/server";
import { runWeeklyRouterPayoutBatch } from "@/src/services/v4/payouts/routerPayoutBatchService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(req: Request): boolean {
  const cronSecret = String(process.env.CRON_SECRET ?? "").trim();
  const internalSecret = String(process.env.INTERNAL_SECRET ?? "").trim();
  const authHeader = String(req.headers.get("authorization") ?? "").trim();
  const internalHeader = String(req.headers.get("x-internal-secret") ?? "").trim();

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  if (internalSecret && internalHeader === internalSecret) return true;
  return !cronSecret && !internalSecret;
}

async function handleRequest(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  try {
    const result = await runWeeklyRouterPayoutBatch(startedAt);
    return NextResponse.json({
      ok: true,
      started_at: startedAt.toISOString(),
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process router payout batch";
    console.error("[ROUTER_PAYOUT_BATCH_FAILED]", { message });
    return NextResponse.json(
      { ok: false, error: message, started_at: startedAt.toISOString() },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  return handleRequest(req);
}

export async function POST(req: Request) {
  return handleRequest(req);
}
