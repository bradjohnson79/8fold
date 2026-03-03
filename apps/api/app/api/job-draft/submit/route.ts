import { NextResponse } from "next/server";
import { requireJobPoster } from "@/src/auth/rbac";

const DEPRECATED_SUBMIT_GUARDRAILS = {
  status: "OPEN_FOR_ROUTING",
  paymentGateMessage: "Payment hold is required before submit.",
} as const;

function gone() {
  // eslint-disable-next-line no-console
  console.warn("[JOB_DRAFT_ROUTE_DEPRECATED]");
  return NextResponse.json({ error: "Draft system deprecated", guardrails: DEPRECATED_SUBMIT_GUARDRAILS }, { status: 410 });
}

export async function POST(req: Request) {
  try {
    await requireJobPoster(req);
    return gone();
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Draft system deprecated" }, { status });
  }
}
