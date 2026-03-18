/**
 * LGS proxy: senders PATCH.
 */
import { NextResponse } from "next/server";
import { proxyToApi } from "@/server/api/proxy";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const res = await proxyToApi(`/api/lgs/senders/${id}`, { method: "PATCH", body });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
