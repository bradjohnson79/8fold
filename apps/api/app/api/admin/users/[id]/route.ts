import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { eq } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { users } from "../../../../../db/schema/user";
import { jobPosters, routers, contractorAccounts } from "../../../../../db/schema";
import { readJsonBody } from "@/src/lib/api/readJsonBody";
import { logEvent } from "@/src/server/observability/log";

const EditBodySchema = z.object({
  name: z.string().trim().optional(),
  email: z.string().email().trim().optional(),
  phone: z.string().trim().optional(),
  country: z.string().trim().optional(),
  state: z.string().trim().optional(),
  city: z.string().trim().optional(),
});

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await ctx.params;
    const row = await db
      .select({
        id: users.id,
        authUserId: users.authUserId,
        email: users.email,
        phone: users.phone,
        name: users.name,
        role: users.role,
        status: users.status,
        suspendedUntil: users.suspendedUntil,
        suspensionReason: users.suspensionReason,
        archivedAt: users.archivedAt,
        archivedReason: users.archivedReason,
        country: users.country,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    const u = row[0] ?? null;
    if (!u) {
      return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
    }

    const [jobPoster, router, contractor] = await Promise.all([
      db.select().from(jobPosters).where(eq(jobPosters.userId, id)).limit(1),
      db.select().from(routers).where(eq(routers.userId, id)).limit(1),
      db.select().from(contractorAccounts).where(eq(contractorAccounts.userId, id)).limit(1),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        user: {
          ...u,
          suspendedUntil: (u.suspendedUntil as any)?.toISOString?.() ?? null,
          archivedAt: (u.archivedAt as any)?.toISOString?.() ?? null,
          createdAt: (u.createdAt as any)?.toISOString?.() ?? String(u.createdAt),
          updatedAt: (u.updatedAt as any)?.toISOString?.() ?? String(u.updatedAt),
        },
        jobPoster: jobPoster[0] ?? null,
        router: router[0] ?? null,
        contractorAccount: contractor[0] ?? null,
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/users/[id]", { userId: auth.userId });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await ctx.params;
    const j = await readJsonBody(req);
    if (!j.ok) return j.resp;
    const body = EditBodySchema.safeParse(j.json);
    if (!body.success) {
      return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
    }

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
    if (!existing[0]) {
      return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      updatedByAdminId: auth.userId,
      updatedAt: new Date(),
    };
    if (body.data.name !== undefined) updates.name = body.data.name;
    if (body.data.email !== undefined) updates.email = body.data.email;
    if (body.data.phone !== undefined) updates.phone = body.data.phone;
    if (body.data.country !== undefined) updates.country = body.data.country;

    await db.update(users).set(updates as any).where(eq(users.id, id));

    if (body.data.state !== undefined || body.data.city !== undefined) {
      const [routerRow, contractorRow] = await Promise.all([
        db.select({ userId: routers.userId }).from(routers).where(eq(routers.userId, id)).limit(1),
        db.select({ userId: contractorAccounts.userId }).from(contractorAccounts).where(eq(contractorAccounts.userId, id)).limit(1),
      ]);
      if (routerRow[0]) {
        const rUpdates: Record<string, unknown> = {};
        if (body.data.state !== undefined) rUpdates.homeRegionCode = body.data.state;
        if (body.data.city !== undefined) rUpdates.homeCity = body.data.city;
        if (Object.keys(rUpdates).length) await db.update(routers).set(rUpdates as any).where(eq(routers.userId, id));
      }
      if (contractorRow[0]) {
        const cUpdates: Record<string, unknown> = {};
        if (body.data.state !== undefined) cUpdates.regionCode = body.data.state;
        if (body.data.city !== undefined) cUpdates.city = body.data.city;
        if (Object.keys(cUpdates).length) await db.update(contractorAccounts).set(cUpdates as any).where(eq(contractorAccounts.userId, id));
      }
    }

    logEvent({
      level: "info",
      event: "admin.user_action",
      route: "/api/admin/users/[id]",
      method: "PATCH",
      status: 200,
      userId: auth.userId,
      code: "ADMIN_USER_EDIT",
      context: { targetUserId: id },
    });

    return NextResponse.json({ ok: true, data: {} });
  } catch (err) {
    return handleApiError(err, "PATCH /api/admin/users/[id]", { userId: auth.userId });
  }
}
