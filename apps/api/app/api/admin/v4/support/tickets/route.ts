import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { v4AdminSupportTickets } from "@/db/schema/v4AdminSupportTicket";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok } from "@/src/lib/api/adminV4Response";
import { adminListSupportTickets } from "@/src/services/v4/v4SupportService";

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { searchParams } = new URL(req.url);
  const status = String(searchParams.get("status") ?? "").trim();
  const limit = Math.max(1, Math.min(200, Number(searchParams.get("take") ?? searchParams.get("limit") ?? 100)));
  const source = String(searchParams.get("source") ?? "v4").trim().toLowerCase();

  try {
    if (source === "legacy") {
      // Legacy admin support tickets (v4AdminSupportTickets read-model)
      const rows = await db
        .select()
        .from(v4AdminSupportTickets)
        .where(status ? and(eq(v4AdminSupportTickets.status, status)) : undefined)
        .orderBy(desc(v4AdminSupportTickets.updatedAt))
        .limit(limit);
      return ok({ tickets: rows, source: "legacy" });
    }

    // Default: v4 user-submitted support tickets
    const tickets = await adminListSupportTickets({ status: status || undefined, limit });
    return ok({ tickets, source: "v4" });
  } catch (error) {
    console.error("[ADMIN_V4_SUPPORT_TICKETS_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return ok({ tickets: [] as Array<Record<string, unknown>>, source });
  }
}
