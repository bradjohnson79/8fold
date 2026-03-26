import { processDiscoveryRunById } from "@/src/services/lgs/domainDiscoveryService";
import { triggerDiscoveryRun } from "@/src/services/lgs/discoveryRunTriggerService";

export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

async function handle(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { run_id?: string };
  const runId = body.run_id?.trim();
  if (!runId) {
    return Response.json({ ok: false, error: "run_id_required" }, { status: 400 });
  }

  try {
    const result = await processDiscoveryRunById(runId);
    if (result.ok && result.remainingDomains > 0) {
      triggerDiscoveryRun(new URL(req.url).origin, runId, "continue_remaining_batches");
    }
    return Response.json({ ok: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return handle(req);
}
