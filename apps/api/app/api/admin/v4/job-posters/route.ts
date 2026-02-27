import crypto from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { jobPosters, users } from "@/db/schema";
import { db, jobPostersRepo, mapUsersRowsToAdminUserDTO, requireAdmin, requireAdminTier } from "@/src/adminBus";
import { err, ok } from "@/src/lib/api/adminV4Response";

export const dynamic = "force-dynamic";

const CreateJobPosterSchema = z.object({
  clerkUserId: z.string().trim().min(1),
  email: z.string().trim().email(),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(7).max(32).optional(),
  country: z.enum(["US", "CA"]).default("US"),
  regionCode: z.string().trim().min(1).max(16),
});

export async function GET(req: Request) {
  const authed = await requireAdmin(req);
  if (authed instanceof Response) return authed;

  try {
    const { searchParams } = new URL(req.url);
    const params = jobPostersRepo.parseRoleListParams(searchParams);
    const data = await jobPostersRepo.list(params);
    return ok({ ...data, rows: mapUsersRowsToAdminUserDTO(data.rows as any[]) });
  } catch (error) {
    console.error("[ADMIN_V4_JOB_POSTERS_LIST_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_JOB_POSTERS_LIST_FAILED", "Failed to load job posters");
  }
}

export async function POST(req: Request) {
  const authed = await requireAdminTier(req, "ADMIN_OPERATOR");
  if (authed instanceof Response) return authed;

  try {
    const json = await req.json().catch(() => null);
    const body = CreateJobPosterSchema.safeParse(json);
    if (!body.success) return err(400, "ADMIN_V4_JOB_POSTER_CREATE_INVALID", "Invalid job poster create payload");

    const now = new Date();
    const data = body.data;

    const existingUsers = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(or(eq(users.clerkUserId, data.clerkUserId), eq(users.email, data.email)))
      .limit(2);
    const existing = existingUsers[0] ?? null;
    if (existing && String(existing.role).toUpperCase() !== "JOB_POSTER") {
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
          role: "JOB_POSTER",
          status: "ACTIVE",
          country: data.country as any,
          countryCode: data.country as any,
          stateCode: data.regionCode.toUpperCase(),
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
          legalCountry: data.country,
          updatedByAdminId: authed.adminId,
          updatedAt: now,
        } as any)
        .where(and(eq(users.id, userId), eq(users.role, "JOB_POSTER" as any)));
    }

    if (!userId) return err(500, "ADMIN_V4_JOB_POSTER_CREATE_FAILED", "Failed to create job poster user");

    await db
      .insert(jobPosters)
      .values({
        userId,
        defaultRegion: data.regionCode.toUpperCase(),
        isActive: true,
        createdByAdmin: true,
        createdAt: now,
      } as any)
      .onConflictDoUpdate({
        target: jobPosters.userId,
        set: {
          defaultRegion: data.regionCode.toUpperCase(),
          isActive: true,
          createdByAdmin: true,
        } as any,
      });

    return ok({ userId, role: "JOB_POSTER", created: true }, 201);
  } catch (error) {
    console.error("[ADMIN_V4_JOB_POSTER_CREATE_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_JOB_POSTER_CREATE_FAILED", "Failed to create job poster");
  }
}
