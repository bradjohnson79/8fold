import { runWarmupCycle } from "@/scripts/lgs-warmup-worker";
import { getWarmupEnabled } from "@/src/services/lgs/warmupConfigService";

export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;

  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

async function handleWarmup(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  console.log("[LGS Warmup Cron] Triggered", { startedAt, method: req.method });

  try {
    const warmupEnabled = await getWarmupEnabled();
    if (!warmupEnabled) {
      console.log("[LGS Warmup Cron] Warmup complete. Scheduler remains disabled.");
      return Response.json({ ok: true, started_at: startedAt, skipped: true, reason: "warmup_complete" });
    }

    await runWarmupCycle();
    return Response.json({ ok: true, started_at: startedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[LGS Warmup Cron] Failed", { startedAt, message });
    return Response.json({ ok: false, error: message, started_at: startedAt }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handleWarmup(req);
}

export async function POST(req: Request) {
  return handleWarmup(req);
}
