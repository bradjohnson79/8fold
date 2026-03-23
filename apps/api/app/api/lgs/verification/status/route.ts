import { NextResponse } from "next/server";
import { getVerificationProgress } from "@/src/services/lgs/emailVerificationService";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const pipeline = sp.get("pipeline") === "jobs" ? "jobs" : "contractor";
    const allPending = sp.get("all_pending") === "true";
    const leadIds = (sp.get("lead_ids") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const data = await getVerificationProgress({
      pipeline,
      leadIds,
      allPending,
    });

    return NextResponse.json({ ok: true, data: { pipeline, ...data } });
  } catch (err) {
    console.error("[Verify] Status error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "verification_status_failed" },
      { status: 500 }
    );
  }
}
