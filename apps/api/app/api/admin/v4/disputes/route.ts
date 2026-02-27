import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { v4AdminDisputes } from "@/db/schema/v4AdminDispute";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok } from "@/src/lib/api/adminV4Response";

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { searchParams } = new URL(req.url);
  const status = String(searchParams.get("status") ?? "").trim();
  const limit = Math.max(1, Math.min(200, Number(searchParams.get("take") ?? searchParams.get("limit") ?? 100)));

  try {
    const rows = await db
      .select()
      .from(v4AdminDisputes)
      .where(status ? and(eq(v4AdminDisputes.status, status)) : undefined)
      .orderBy(desc(v4AdminDisputes.createdAt))
      .limit(limit);

    return ok({ disputes: rows });
  } catch (error) {
    console.error("[ADMIN_V4_DISPUTES_FALLBACK]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return ok({ disputes: [] as Array<Record<string, unknown>> });
  }
}
