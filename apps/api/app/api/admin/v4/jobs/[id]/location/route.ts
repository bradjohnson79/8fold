import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { auditLogs, jobs } from "@/db/schema";
import {
  requireAdminIdentityWithTier,
  enforceTier,
} from "@/app/api/admin/_lib/adminTier";
import { err, ok } from "@/src/lib/api/adminV4Response";

const LocationUpdateSchema = z.object({
  formattedAddress: z.string().trim().min(1),
  city: z.string().trim().min(1),
  region: z.string().trim().min(1),
  regionCode: z.string().trim().min(1).max(10),
  country: z.string().trim().min(1),
  countryCode: z.enum(["US", "CA"]),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const identity = await requireAdminIdentityWithTier(req);
  if (identity instanceof Response) return identity;

  const tierBlock = enforceTier(identity, "ADMIN_SUPER");
  if (tierBlock) return tierBlock;

  const { id: jobId } = await ctx.params;

  const bodyRaw = await req.json().catch(() => null);
  const body = LocationUpdateSchema.safeParse(bodyRaw);
  if (!body.success) {
    return err(400, "ADMIN_V4_INVALID_LOCATION", "Invalid location payload");
  }

  try {
    const currentRows = await db
      .select({
        id: jobs.id,
        addressFull: jobs.address_full,
        city: jobs.city,
        region: jobs.region,
        regionCode: jobs.region_code,
        stateCode: jobs.state_code,
        country: jobs.country,
        countryCode: jobs.country_code,
        lat: jobs.lat,
        lng: jobs.lng,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    const current = currentRows[0] ?? null;
    if (!current) return err(404, "ADMIN_V4_JOB_NOT_FOUND", "Job not found");

    const now = new Date();
    const { formattedAddress, city, region, regionCode, country, countryCode, latitude, longitude } = body.data;

    await db
      .update(jobs)
      .set({
        address_full: formattedAddress,
        city,
        region: regionCode.toLowerCase(),
        region_code: regionCode.toUpperCase(),
        state_code: regionCode.toUpperCase(),
        province: regionCode.toUpperCase(),
        country: countryCode as any,
        country_code: countryCode as any,
        lat: latitude,
        lng: longitude,
        updated_at: now,
      })
      .where(eq(jobs.id, jobId));

    try {
      await db.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: identity.userId,
        actorAdminUserId: identity.userId,
        action: "JOB_LOCATION_UPDATED",
        entityType: "Job",
        entityId: jobId,
        metadata: {
          oldLocation: {
            addressFull: current.addressFull,
            city: current.city,
            region: current.region,
            regionCode: current.regionCode,
            stateCode: current.stateCode,
            country: current.country,
            countryCode: current.countryCode,
            lat: current.lat,
            lng: current.lng,
          },
          newLocation: {
            addressFull: formattedAddress,
            city,
            region,
            regionCode,
            country,
            countryCode,
            lat: latitude,
            lng: longitude,
          },
          adminEmail: identity.email,
          adminRole: identity.adminRole,
        } as any,
      });
    } catch (auditErr) {
      console.error("[ADMIN_V4_JOB_LOCATION_AUDIT_WRITE_ERROR]", {
        jobId,
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }

    return ok({
      jobId,
      location: {
        addressFull: formattedAddress,
        city,
        regionCode: regionCode.toUpperCase(),
        countryCode,
        latitude,
        longitude,
      },
    });
  } catch (error) {
    console.error("[ADMIN_V4_JOB_LOCATION_UPDATE_ERROR]", {
      jobId,
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_JOB_LOCATION_UPDATE_FAILED", "Failed to update job location");
  }
}
