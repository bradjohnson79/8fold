/**
 * LGS: Cancel a running discovery scan.
 * Sets status = "cancel_requested". The worker checks this between domains
 * and will stop processing, leaving contractor_leads untouched.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { discoveryRuns } from "@/db/schema/directoryEngine";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: runId } = await params;
    if (!runId) {
      return NextResponse.json({ ok: false, error: "run_id_required" }, { status: 400 });
    }

    const [run] = await db
      .select({ id: discoveryRuns.id, status: discoveryRuns.status })
      .from(discoveryRuns)
      .where(eq(discoveryRuns.id, runId))
      .limit(1);

    if (!run) {
      return NextResponse.json({ ok: false, error: "run_not_found" }, { status: 404 });
    }

    const cancellable = ["running", "cancel_requested"];
    if (!cancellable.includes(run.status ?? "")) {
      return NextResponse.json(
        { ok: false, error: `Cannot cancel a run with status: ${run.status}` },
        { status: 409 }
      );
    }

    await db
      .update(discoveryRuns)
      .set({ status: "cancel_requested" })
      .where(eq(discoveryRuns.id, runId));

    return NextResponse.json({ ok: true, data: { run_id: runId, status: "cancel_requested" } });
  } catch (err) {
    console.error("LGS discovery cancel error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "cancel_failed" },
      { status: 500 }
    );
  }
}
