/**
 * LGS proxy route (apps/lgs).
 *
 * Isolation boundary: this layer does not touch DB, jobs, ledger, or Stripe.
 * It forwards requests to `apps/api` at `/api/lgs/*` via `proxyToApi`.
 */
import { NextResponse } from "next/server";
import { proxyToApi } from "@/server/api/proxy";

export async function GET() {
  const res = await proxyToApi("/api/lgs/dashboard");
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
