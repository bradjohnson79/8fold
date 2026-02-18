/**
 * DISE proxy route (apps/dise).
 *
 * Isolation boundary: this layer does not touch DB, jobs, ledger, or Stripe.
 * It forwards requests to `apps/api` at `/api/dise/*` via `proxyToApi`.
 */
import { NextResponse } from "next/server";
import { proxyToApi } from "@/server/api/proxy";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const res = await proxyToApi(`/api/dise/submissions/${id}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const res = await proxyToApi(`/api/dise/submissions/${id}`, {
    method: "PATCH",
    body,
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
