/**
 * DISE proxy route (apps/dise).
 *
 * Isolation boundary: this layer does not touch DB, jobs, ledger, or Stripe.
 * It forwards requests to `apps/api` at `/api/dise/*` via `proxyToApi`.
 */
import { NextResponse } from "next/server";
import { proxyToApi } from "@/server/api/proxy";

export async function GET() {
  const res = await proxyToApi("/api/dise/dashboard");
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
