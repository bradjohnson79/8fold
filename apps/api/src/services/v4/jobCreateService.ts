import { randomUUID } from "crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { v4AppraisalTokenConsumptions } from "@/db/schema/v4AppraisalTokenConsumption";
import { jobPosterProfilesV4 } from "@/db/schema/jobPosterProfileV4";
import { jobs } from "@/db/schema/job";
import { jobPhotos } from "@/db/schema/jobPhoto";
import { v4JobUploads } from "@/db/schema/v4JobUpload";
import { buildAppraisalPayloadHash, verifyAppraisalTokenOrThrow } from "@/src/services/v4/appraisalTokenService";
import { calculateDistanceKm } from "@/src/services/v4/geoDistanceService";
import { reverseGeocodeProvince } from "@/src/services/v4/geocodeService";
import { URBAN_RADIUS_KM } from "@/src/validation/v4/constants";
import { type V4JobCreateBody, V4JobCreateBodySchema } from "@/src/validation/v4/jobCreateSchema";

type UploadRow = { id: string; url: string };

export function assertUploadOwnershipResolved(requestedUploadIds: string[], uploadRows: UploadRow[]): void {
  if (uploadRows.length !== requestedUploadIds.length) {
    throw Object.assign(new Error("Unknown or unowned uploadIds"), { status: 400 });
  }
}

export function assertProvinceMatchesGeocode(inputProvince: string, geocodedProvince: string): void {
  if (String(inputProvince).trim().toUpperCase() !== String(geocodedProvince).trim().toUpperCase()) {
    throw Object.assign(new Error("Province mismatch with geocoded coordinates"), { status: 400 });
  }
}

export function assertTokenNotConsumed(existing: { token: string } | null): void {
  if (existing) {
    throw Object.assign(new Error("Appraisal token already consumed"), { status: 409 });
  }
}

export function assertAppraisalTokenMatchesPayload(input: V4JobCreateBody, actorUserId: string): void {
  const payloadHash = buildAppraisalPayloadHash({
    userId: actorUserId,
    title: input.title,
    description: input.scope,
    tradeCategory: input.trade_category,
    provinceState: input.provinceState,
    latitude: input.latitude,
    longitude: input.longitude,
    isRegionalRequested: input.isRegionalRequested,
  });

  verifyAppraisalTokenOrThrow({
    token: input.appraisalToken,
    expectedUserId: actorUserId,
    expectedPayloadHash: payloadHash,
  });
}

export async function createV4Job(input: V4JobCreateBody, actorUserId: string) {
  const now = new Date();
  const jobId = randomUUID();
  // TODO: Add idempotency key handling to prevent duplicate job creation on retries
  assertAppraisalTokenMatchesPayload(input, actorUserId);

  await db.transaction(async (tx) => {
    const resolvedProvince = await reverseGeocodeProvince(input.latitude, input.longitude);
    assertProvinceMatchesGeocode(input.provinceState, resolvedProvince);

    const consumedRows = await tx
      .select({ token: v4AppraisalTokenConsumptions.token })
      .from(v4AppraisalTokenConsumptions)
      .where(eq(v4AppraisalTokenConsumptions.token, input.appraisalToken))
      .limit(1);
    assertTokenNotConsumed(consumedRows[0] ?? null);

    const profileRows = await tx
      .select({
        latitude: jobPosterProfilesV4.latitude,
        longitude: jobPosterProfilesV4.longitude,
      })
      .from(jobPosterProfilesV4)
      .where(eq(jobPosterProfilesV4.userId, actorUserId))
      .limit(1);

    const origin = profileRows[0] ?? null;
    const distanceKm = origin
      ? calculateDistanceKm(origin.latitude, origin.longitude, input.latitude, input.longitude)
      : 0;
    const isRegionalComputed = distanceKm > URBAN_RADIUS_KM || input.isRegionalRequested;
    const regionalSurchargeCents = isRegionalComputed ? 2000 : 0;
    const totalAmountCents = input.labor_total_cents + regionalSurchargeCents;

    await tx.insert(jobs).values({
      id: jobId,
      status: "PUBLISHED",
      archived: false,
      title: input.title,
      scope: input.scope,
      region: resolvedProvince,
      country: input.country,
      country_code: input.country,
      state_code: resolvedProvince.slice(0, 10),
      region_code: resolvedProvince.slice(0, 10),
      city: input.city ?? null,
      address_full: input.address_full ?? null,
      currency: input.country === "CA" ? "CAD" : "USD",
      payment_currency: input.country === "CA" ? "cad" : "usd",
      labor_total_cents: input.labor_total_cents,
      amount_cents: totalAmountCents,
      price_adjustment_cents: regionalSurchargeCents,
      job_type: isRegionalComputed ? "regional" : "urban",
      trade_category: input.trade_category as any,
      service_type: "handyman",
      job_poster_user_id: actorUserId,
      availability: input.availability as any,
      lat: input.latitude,
      lng: input.longitude,
      posted_at: now,
      published_at: now,
      created_at: now,
      updated_at: now,
    });

    if (input.uploadIds.length > 0) {
      const uploadRows = await tx
        .select({
          id: v4JobUploads.id,
          url: v4JobUploads.url,
        })
        .from(v4JobUploads)
        .where(and(inArray(v4JobUploads.id, input.uploadIds), eq(v4JobUploads.userId, actorUserId), isNull(v4JobUploads.usedAt)));

      assertUploadOwnershipResolved(input.uploadIds, uploadRows);

      try {
        for (const upload of uploadRows) {
          await tx.insert(jobPhotos).values({
            id: randomUUID(),
            jobId,
            kind: "CUSTOMER_SCOPE",
            actor: "CUSTOMER",
            url: upload.url,
          });
        }
        await tx
          .update(v4JobUploads)
          .set({ usedAt: now })
          .where(and(inArray(v4JobUploads.id, input.uploadIds), eq(v4JobUploads.userId, actorUserId)));
      } catch (photoErr: unknown) {
        const msg = String((photoErr as Error)?.message ?? "");
        if (msg.includes("does not exist") || msg.includes("relation")) {
          await tx
            .update(jobs)
            .set({ photo_urls: uploadRows.map((u) => u.url), updated_at: now })
            .where(eq(jobs.id, jobId));
        } else {
          throw photoErr;
        }
      }
    }

    try {
      await tx.insert(v4AppraisalTokenConsumptions).values({
        id: randomUUID(),
        userId: actorUserId,
        token: input.appraisalToken,
        consumedAt: now,
        jobId,
      });
    } catch (err) {
      const msg = String((err as Error)?.message ?? "");
      if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate")) {
        throw Object.assign(new Error("Appraisal token already consumed"), { status: 409 });
      }
      throw err;
    }
  });

  return { ok: true as const, jobId };
}

export { V4JobCreateBodySchema };
