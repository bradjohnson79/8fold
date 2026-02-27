import crypto from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { routers, users } from "@/db/schema";
import { db, mapUsersRowsToAdminUserDTO, requireAdmin, requireAdminTier, routersRepo } from "@/src/adminBus";
import { err, ok } from "@/src/lib/api/adminV4Response";

export const dynamic = "force-dynamic";

const CreateRouterSchema = z.object({
  clerkUserId: z.string().trim().min(1),
  email: z.string().trim().email(),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(7).max(32).optional(),
  country: z.enum(["US", "CA"]).default("US"),
  regionCode: z.string().trim().min(1).max(16),
  city: z.string().trim().min(1).max(100).optional(),
});

export async function GET(req: Request) {
  const authed = await requireAdmin(req);
  if (authed instanceof Response) return authed;

  try {
    const { searchParams } = new URL(req.url);
    const params = routersRepo.parseRoleListParams(searchParams);
    const data = await routersRepo.list(params);
    return ok({ ...data, rows: mapUsersRowsToAdminUserDTO(data.rows as any[]) });
  } catch (error) {
    console.error("[ADMIN_V4_ROUTERS_LIST_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_ROUTERS_LIST_FAILED", "Failed to load routers");
  }
}

export async function POST(req: Request) {
  const authed = await requireAdminTier(req, "ADMIN_OPERATOR");
  if (authed instanceof Response) return authed;

  try {
    const json = await req.json().catch(() => null);
    const body = CreateRouterSchema.safeParse(json);
    if (!body.success) return err(400, "ADMIN_V4_ROUTER_CREATE_INVALID", "Invalid router create payload");

    const now = new Date();
    const data = body.data;

    const existingUsers = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(or(eq(users.clerkUserId, data.clerkUserId), eq(users.email, data.email)))
      .limit(2);
    const existing = existingUsers[0] ?? null;
    if (existing && String(existing.role).toUpperCase() !== "ROUTER") {
      return err(409, "ROLE_IMMUTABLE", "User already exists with a different role.");
    }

    let userId = existing?.id ?? null;
    if (!userId) {
      const inserted = await db
        .insert(users)
        .values({
          id: crypto.randomUUID(),
          clerkUserId: data.clerkUserId,
          email: data.email,
          name: data.name,
          phone: data.phone ?? null,
          role: "ROUTER",
          status: "ACTIVE",
          country: data.country as any,
          countryCode: data.country as any,
          stateCode: data.regionCode.toUpperCase(),
          legalCity: data.city ?? "",
          legalCountry: data.country,
          updatedByAdminId: authed.adminId,
          createdAt: now,
          updatedAt: now,
        } as any)
        .returning({ id: users.id });
      userId = inserted[0]?.id ?? null;
    } else {
      await db
        .update(users)
        .set({
          email: data.email,
          name: data.name,
          phone: data.phone ?? null,
          status: "ACTIVE",
          country: data.country as any,
          countryCode: data.country as any,
          stateCode: data.regionCode.toUpperCase(),
          legalCity: data.city ?? "",
          legalCountry: data.country,
          updatedByAdminId: authed.adminId,
          updatedAt: now,
        } as any)
        .where(and(eq(users.id, userId), eq(users.role, "ROUTER" as any)));
    }

    if (!userId) return err(500, "ADMIN_V4_ROUTER_CREATE_FAILED", "Failed to create router user");

    await db
      .insert(routers)
      .values({
        userId,
        homeCountry: data.country as any,
        homeRegionCode: data.regionCode.toUpperCase(),
        homeCity: data.city ?? null,
        status: "ACTIVE",
        dailyRouteLimit: 10,
        termsAccepted: true,
        profileComplete: true,
        createdByAdmin: true,
        createdAt: now,
      } as any)
      .onConflictDoUpdate({
        target: routers.userId,
        set: {
          homeCountry: data.country as any,
          homeRegionCode: data.regionCode.toUpperCase(),
          homeCity: data.city ?? null,
          status: "ACTIVE",
          termsAccepted: true,
          profileComplete: true,
          createdByAdmin: true,
        } as any,
      });

    return ok({ userId, role: "ROUTER", created: true }, 201);
  } catch (error) {
    console.error("[ADMIN_V4_ROUTER_CREATE_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_ROUTER_CREATE_FAILED", "Failed to create router");
  }
}
