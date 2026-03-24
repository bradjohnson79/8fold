import { enqueueLeadVerificationBatch, runEmailVerificationWorker } from "@/src/services/lgs/emailVerificationService";
import { db } from "@/db/drizzle";
import { lgsWorkerHealth } from "@/db/schema/directoryEngine";

export const dynamic = "force-dynamic";

const WORKER_NAME = "verification_cron";
// Max leads to enqueue per cron tick — prevents queue flooding at scale
const ENQUEUE_LIMIT = 100;

function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;

  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

async function writeHeartbeat(status: "ok" | "error", startedAt: Date, error?: string) {
  const now = new Date();
  await db
    .insert(lgsWorkerHealth)
    .values({
      workerName: WORKER_NAME,
      lastHeartbeatAt: now,
      lastRunStartedAt: startedAt,
      lastRunFinishedAt: now,
      lastRunStatus: status,
      lastError: error ?? null,
    })
    .onConflictDoUpdate({
      target: lgsWorkerHealth.workerName,
      set: {
        lastHeartbeatAt: now,
        lastRunStartedAt: startedAt,
        lastRunFinishedAt: now,
        lastRunStatus: status,
        lastError: error ?? null,
      },
    });
}

async function handleVerification(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  console.log("[LGS Verification Cron] Triggered", { startedAt: startedAt.toISOString(), method: req.method });

  try {
    // Step 1: auto-enqueue pending contractor leads that aren't in the queue yet.
    // limit=ENQUEUE_LIMIT prevents flooding the queue at scale.
    // The function already guards: email IS NOT NULL, archived = false, not already valid.
    const enqueued = await enqueueLeadVerificationBatch({
      pipeline: "contractor",
      allPending: true,
      limit: ENQUEUE_LIMIT,
    });
    console.log("[LGS Verification Cron] Enqueue result", enqueued);

    // Step 2: drain a batch from the queue (DNS/SMTP verification).
    const result = await runEmailVerificationWorker();
    console.log("[LGS Verification Cron] Worker result", result);

    // Step 3: write real heartbeat so the System Monitor shows live status.
    await writeHeartbeat("ok", startedAt);

    return Response.json({
      ok: true,
      started_at: startedAt.toISOString(),
      enqueued,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[LGS Verification Cron] Failed", { startedAt: startedAt.toISOString(), message });
    await writeHeartbeat("error", startedAt, message).catch(() => {/* don't mask original error */});
    return Response.json({ ok: false, error: message, started_at: startedAt.toISOString() }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handleVerification(req);
}

export async function POST(req: Request) {
  return handleVerification(req);
}
