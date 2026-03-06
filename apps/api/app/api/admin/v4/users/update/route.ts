import { z } from "zod";
import { eq } from "drizzle-orm";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { requireAdminTier } from "@/src/adminBus";
import { adminAuditLog } from "@/src/audit/adminAudit";
import { db } from "@/src/adminBus/db";
import { users } from "@/db/schema";
import { contractorProfilesV4 } from "@/db/schema/contractorProfileV4";
import { routerProfilesV4 } from "@/db/schema/routerProfileV4";
import { jobPosterProfilesV4 } from "@/db/schema/jobPosterProfileV4";

export const dynamic = "force-dynamic";

const FieldsSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().optional(),
  businessName: z.string().trim().optional(),
  homeRegion: z.string().trim().optional(),
  homeCountry: z.string().trim().optional(),
  company: z.string().trim().optional(),
});

const BodySchema = z.object({
  id: z.string().min(1),
  fields: FieldsSchema,
});

export async function POST(req: Request) {
  const authed = await requireAdminTier(req, "ADMIN_OPERATOR");
  if (authed instanceof Response) return authed;

  try {
    const payload = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(payload);
    if (!parsed.success) {
      return err(400, "ADMIN_V4_UPDATE_INVALID", "Invalid body: id and fields are required");
    }

    const { id, fields } = parsed.data;

    const userRows = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, id)).limit(1);
    const user = userRows[0];
    if (!user) {
      return err(404, "ADMIN_V4_USER_NOT_FOUND", "User not found");
    }

    const role = String(user.role ?? "").toUpperCase();
    const now = new Date();

    const userUpdate: Record<string, any> = { updatedAt: now, updatedByAdminId: authed.adminId };
    if (fields.name !== undefined) userUpdate.name = fields.name;
    if (fields.email !== undefined) userUpdate.email = fields.email;
    if (fields.phone !== undefined) userUpdate.phone = fields.phone;

    if (Object.keys(userUpdate).length > 2) {
      await db.update(users).set(userUpdate as any).where(eq(users.id, id));
    }

    if (role === "CONTRACTOR" && fields.businessName !== undefined) {
      await db
        .update(contractorProfilesV4)
        .set({ businessName: fields.businessName, updatedAt: now } as any)
        .where(eq(contractorProfilesV4.userId, id));
    }

    if (role === "ROUTER") {
      const routerUpdate: Record<string, any> = { updatedAt: now };
      if (fields.homeRegion !== undefined) routerUpdate.homeRegion = fields.homeRegion;
      if (fields.homeCountry !== undefined) routerUpdate.homeCountryCode = fields.homeCountry;
      if (Object.keys(routerUpdate).length > 1) {
        await db.update(routerProfilesV4).set(routerUpdate as any).where(eq(routerProfilesV4.userId, id));
      }
    }

    if (role === "JOB_POSTER" && fields.company !== undefined) {
      await db
        .update(jobPosterProfilesV4)
        .set({ addressLine1: fields.company, updatedAt: now } as any)
        .where(eq(jobPosterProfilesV4.userId, id));
    }

    await adminAuditLog(req, authed as any, {
      action: "USER_PROFILE_UPDATED",
      entityType: "User",
      entityId: id,
      metadata: { updatedFields: Object.keys(fields).filter((k) => (fields as any)[k] !== undefined), role },
    });

    return ok({ updated: true });
  } catch (error) {
    console.error("[ADMIN_V4_USER_UPDATE_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_USER_UPDATE_FAILED", "Failed to update user");
  }
}
