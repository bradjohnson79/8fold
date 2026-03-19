import { NextResponse } from "next/server";
import { runWarmupWorkerCycle } from "@/src/warmup/warmupWorker";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
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
