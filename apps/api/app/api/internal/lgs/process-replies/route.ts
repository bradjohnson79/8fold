import { db } from "@/db/drizzle";
import { lgsWorkerHealth } from "@/db/schema/directoryEngine";
import { runReplyProcessor } from "@/src/services/lgs/outreachDispatchService";

export const dynamic = "force-dynamic";

const WORKER_NAME = "replies_cron";

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

async function handleReplies(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  console.log("[LGS Replies Cron] Triggered", { startedAt: startedAt.toISOString() });

  try {
    const result = await runReplyProcessor();
    await writeHeartbeat("ok", startedAt);
    return Response.json({
      ok: true,
      started_at: startedAt.toISOString(),
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[LGS Replies Cron] Failed", { message });
    await writeHeartbeat("error", startedAt, message).catch(() => {});
    return Response.json({ ok: false, error: message, started_at: startedAt.toISOString() }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handleReplies(req);
}

export async function POST(req: Request) {
  return handleReplies(req);
}
