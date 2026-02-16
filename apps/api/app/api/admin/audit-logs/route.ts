import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const entityType = url.searchParams.get("entityType") ?? undefined;
    const entityId = url.searchParams.get("entityId") ?? undefined;
    const take = Math.min(Number(url.searchParams.get("take") ?? "100") || 100, 250);

    const whereParts: any[] = [];
    if (entityType) whereParts.push(sql`al."entityType" = ${entityType}`);
    if (entityId) whereParts.push(sql`al."entityId" = ${entityId}`);

    const rows = await db.execute(sql`
      select
        al.*,
        to_jsonb(u) as actor
      from "AuditLog" al
      left join "User" u on u."id" = al."actorUserId"
      ${whereParts.length ? sql`where ${sql.join(whereParts, sql` and `)}` : sql``}
      order by al."createdAt" desc
      limit ${take}
    `);

    const auditLogs = rows.rows as any[];

    return NextResponse.json({ ok: true, data: { auditLogs } });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/audit-logs");
  }
}

