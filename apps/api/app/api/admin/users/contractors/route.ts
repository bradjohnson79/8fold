import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { contractorAccounts, users } from "../../../../../db/schema";

const QuerySchema = z.object({
  cursor: z.string().trim().min(1).optional()
});

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({ cursor: url.searchParams.get("cursor") ?? undefined });
    if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });

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
          status: contractorAccounts.status,
          wizardCompleted: contractorAccounts.wizardCompleted,
          waiverAccepted: contractorAccounts.waiverAccepted,
          waiverAcceptedAt: contractorAccounts.waiverAcceptedAt,
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
      ok: true,
      data: {
        contractors: page.map((r: any) => ({
        ...r.contractor,
        waiverAcceptedAt: (r.contractor.waiverAcceptedAt as any)?.toISOString?.() ?? null,
        createdAt: (r.contractor.createdAt as any)?.toISOString?.() ?? String(r.contractor.createdAt),
        user: {
          ...r.user,
          createdAt: (r.user.createdAt as any)?.toISOString?.() ?? String(r.user.createdAt),
          updatedAt: (r.user.updatedAt as any)?.toISOString?.() ?? String(r.user.updatedAt),
        },
      })),
        nextCursor,
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/users/contractors", { userId: auth.userId });
  }
}

