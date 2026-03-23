import { runEmailVerificationWorker } from "@/src/services/lgs/emailVerificationService";

export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;

  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

async function handleVerification(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  console.log("[LGS Verification Cron] Triggered", { startedAt, method: req.method });

  try {
    const result = await runEmailVerificationWorker();
    return Response.json({ ok: true, started_at: startedAt, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[LGS Verification Cron] Failed", { startedAt, message });
    return Response.json({ ok: false, error: message, started_at: startedAt }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handleVerification(req);
}

export async function POST(req: Request) {
  return handleVerification(req);
}
