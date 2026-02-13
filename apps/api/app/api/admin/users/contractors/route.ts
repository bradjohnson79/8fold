import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../src/http/errors";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { contractorAccounts, users } from "../../../../../db/schema";

const QuerySchema = z.object({
  cursor: z.string().trim().min(1).optional()
});

export async function GET(req: Request) {
  try {
    await requireAdmin(req);

    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({ cursor: url.searchParams.get("cursor") ?? undefined });
    if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

    const take = 50;
    // Cursor paging: mirror Prisma behavior (order by createdAt desc, userId desc).
    const cursorUserId = parsed.data.cursor ?? null;
    const cursorRow = cursorUserId
      ? (
          await db
            .select({ createdAt: contractorAccounts.createdAt, userId: contractorAccounts.userId })
            .from(contractorAccounts)
            .where(eq(contractorAccounts.userId, cursorUserId))
            .limit(1)
        )[0] ?? null
      : null;

    const cursorWhere = cursorRow
      ? or(
          lt(contractorAccounts.createdAt, cursorRow.createdAt),
          and(eq(contractorAccounts.createdAt, cursorRow.createdAt), lt(contractorAccounts.userId, cursorRow.userId)),
        )
      : undefined;

    const rows = await db
      .select({
        contractor: {
          userId: contractorAccounts.userId,
          tradeCategory: contractorAccounts.tradeCategory,
          serviceRadiusKm: contractorAccounts.serviceRadiusKm,
          country: contractorAccounts.country,
          regionCode: contractorAccounts.regionCode,
          city: contractorAccounts.city,
          isApproved: contractorAccounts.isApproved,
          jobsCompleted: contractorAccounts.jobsCompleted,
          rating: contractorAccounts.rating,
          createdAt: contractorAccounts.createdAt,
        },
        user: {
          email: users.email,
          phone: users.phone,
          name: users.name,
          role: users.role,
          status: users.status,
          country: users.country,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        },
      })
      .from(contractorAccounts)
      .innerJoin(users, eq(users.id, contractorAccounts.userId))
      .where(cursorWhere as any)
      .orderBy(desc(contractorAccounts.createdAt), desc(contractorAccounts.userId))
      .limit(take + 1);

    const page = rows.slice(0, take);
    const nextCursor = rows.length > take ? rows[take]?.contractor?.userId ?? null : null;

    return NextResponse.json({
      contractors: page.map((r: any) => ({
        ...r.contractor,
        createdAt: (r.contractor.createdAt as any)?.toISOString?.() ?? String(r.contractor.createdAt),
        user: {
          ...r.user,
          createdAt: (r.user.createdAt as any)?.toISOString?.() ?? String(r.user.createdAt),
          updatedAt: (r.user.updatedAt as any)?.toISOString?.() ?? String(r.user.updatedAt),
        },
      })),
      nextCursor
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    if (process.env.ADMIN_AUDIT_LOG === "1" && status >= 500) {
      const traceId = req.headers.get("x-admin-trace-id") ?? null;
      const pg: any = err && typeof err === "object" ? (err as any) : null;
      // eslint-disable-next-line no-console
      console.error("[ADMIN_AUDIT][API_500]", {
        traceId,
        method: req.method,
        path: new URL(req.url).pathname,
        message,
        err,
        stack: err instanceof Error ? err.stack : undefined,
        pg: pg
          ? {
              code: pg.code,
              detail: pg.detail,
              constraint: pg.constraint,
              column: pg.column,
              table: pg.table,
              schema: pg.schema,
            }
          : null,
      });
    }
    return NextResponse.json({ error: message }, { status });
  }
}

