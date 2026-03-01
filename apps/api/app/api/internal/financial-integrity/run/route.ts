import { NextResponse } from "next/server";
import { runFinancialIntegrityCheck } from "@/src/services/financialIntegrity/alertEngine";

let running = false;

function isAuthorizedInternal(req: Request): boolean {
  const expected = String(process.env.INTERNAL_SECRET ?? "").trim();
  if (!expected) return false;
  const provided = String(req.headers.get("x-internal-secret") ?? "").trim();
  return Boolean(provided && provided === expected);
}

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isAuthorizedInternal(req)) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }
  if (running) {
    return NextResponse.json({ ok: false, error: "INTEGRITY_ALREADY_RUNNING" }, { status: 409 });
  }

  running = true;
  try {
    const result = await runFinancialIntegrityCheck({
      maxJobs: 100,
      windowHours: 72,
      timeoutMs: 10_000,
      triggeredBy: "internal:cron",
    });
    return NextResponse.json({ ok: true, data: result }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Integrity run failed",
      },
      { status: 500 },
    );
  } finally {
    running = false;
  }
}
