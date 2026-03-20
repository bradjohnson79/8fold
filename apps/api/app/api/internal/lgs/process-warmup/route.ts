import { NextResponse } from "next/server";
import { runWarmupWorkerCycle } from "@/src/warmup/warmupWorker";

export const dynamic = "force-dynamic";

async function handleWarmupRequest(req: Request) {
  console.log("[LGS Warmup] Warmup route entered", { method: req.method });
  console.log("[LGS Warmup] Warmup cron triggered at", new Date().toISOString());

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      console.warn("[LGS Warmup] Unauthorized warmup route request", { method: req.method });
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await runWarmupWorkerCycle();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[LGS Warmup] cron worker route error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handleWarmupRequest(req);
}

export async function POST(req: Request) {
  return handleWarmupRequest(req);
}
