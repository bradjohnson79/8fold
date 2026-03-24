/**
 * LGS Classification Cron — instant email format classification.
 *
 * Replaces the old SMTP verification worker. No queue. No retries.
 * Classifies any contractor leads that still have unclassified emails.
 * Safe to run every minute — idempotent, instant, zero network calls.
 */
import { classifyLeadBatch } from "@/src/services/lgs/emailVerificationService";
import { db } from "@/db/drizzle";
import { lgsWorkerHealth } from "@/db/schema/directoryEngine";

export const dynamic = "force-dynamic";

const WORKER_NAME = "verification_cron";

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

async function handleClassification(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  console.log("[LGS Classify Cron] Triggered", { startedAt: startedAt.toISOString() });

  try {
    // Classify any contractor leads with unclassified emails — instant, no network.
    // allUnclassified=true skips leads already marked valid or invalid.
    const result = await classifyLeadBatch({
      pipeline: "contractor",
      allUnclassified: true,
      limit: 200,
    });

    console.log("[LGS Classify Cron] Done", result);
    await writeHeartbeat("ok", startedAt);

    return Response.json({
      ok: true,
      started_at: startedAt.toISOString(),
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[LGS Classify Cron] Failed", { message });
    await writeHeartbeat("error", startedAt, message).catch(() => {});
    return Response.json({ ok: false, error: message, started_at: startedAt.toISOString() }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handleClassification(req);
}

export async function POST(req: Request) {
  return handleClassification(req);
}
