import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { runDisputeSlaBreachMonitor } from "@/src/support/disputeSlaMonitor";

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const take = Number(url.searchParams.get("take") ?? 200);
    const result = await runDisputeSlaBreachMonitor({ take });
    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/support/disputes/sla-monitor", {
      route: "/api/admin/support/disputes/sla-monitor",
      userId: auth.userId,
    });
  }
}
