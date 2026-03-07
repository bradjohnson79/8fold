import { createHash, randomUUID } from "crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { v4AppraisalTokenConsumptions } from "@/db/schema/v4AppraisalTokenConsumption";
import { v4IdempotencyKeys } from "@/db/schema/v4IdempotencyKey";
import { jobPosterProfilesV4 } from "@/db/schema/jobPosterProfileV4";
import { jobs } from "@/db/schema/job";
import { jobPhotos } from "@/db/schema/jobPhoto";
import { v4JobUploads } from "@/db/schema/v4JobUpload";
import { buildAppraisalPayloadHash, verifyAppraisalTokenOrThrow } from "@/src/services/v4/appraisalTokenService";
import { calculateDistanceKm } from "@/src/services/v4/geoDistanceService";
import { reverseGeocodeProvince, normalizeRegionToCode } from "@/src/services/v4/geocodeService";
import { badRequest, conflict, internal } from "@/src/services/v4/v4Errors";
import { URBAN_RADIUS_KM } from "@/src/validation/v4/constants";
import { type V4JobCreateBody, V4JobCreateBodySchema } from "@/src/validation/v4/jobCreateSchema";
import { deriveCountryFromRegion } from "@/src/jobs/jurisdictionGuard";

type UploadRow = { id: string; url: string };

export function assertUploadOwnershipResolved(requestedUploadIds: string[], uploadRows: UploadRow[]): void {
  if (uploadRows.length !== requestedUploadIds.length) {
    throw badRequest("V4_UPLOAD_UNOWNED_OR_MISSING", "Unknown or unowned uploadIds");
  }
}

export function assertProvinceMatchesGeocode(inputProvince: string, geocodedProvince: string): void {
  if (String(inputProvince).trim().toUpperCase() !== String(geocodedProvince).trim().toUpperCase()) {
    throw badRequest("V4_PROVINCE_MISMATCH", "Province mismatch with geocoded coordinates");
  }
}

export function assertTokenNotConsumed(existing: { token: string } | null): void {
  if (existing) {
    throw conflict("V4_APPRAISAL_TOKEN_REUSED", "Appraisal token already consumed");
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

export function hashV4CreateRequestPayload(input: V4JobCreateBody): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        title: input.title.trim(),
        scope: input.scope.trim(),
        region: input.region.trim(),
        state_code: input.state_code.trim(),
        country: input.country,
        trade_category: input.trade_category,
        appraisalCompleted: input.appraisalCompleted,
        appraisalToken: input.appraisalToken.trim(),
        labor_total_cents: input.labor_total_cents,
        city: input.city ?? null,
        address_full: input.address_full ?? null,
        provinceState: input.provinceState.trim(),
        latitude: input.latitude,
        longitude: input.longitude,
        isRegionalRequested: input.isRegionalRequested,
        uploadIds: input.uploadIds,
        availability: input.availability,
      }),
    )
    .digest("hex");
}

type IdempotencyOutcome = { state: "new" } | { state: "completed"; jobId: string };

async function claimIdempotencyKeyOrThrow(tx: any, args: { key: string; userId: string; requestHash: string; now: Date }): Promise<IdempotencyOutcome> {
  try {
    await tx.insert(v4IdempotencyKeys).values({
      key: args.key,
      userId: args.userId,
      requestHash: args.requestHash,
      status: "IN_PROGRESS",
      jobId: null,
      createdAt: args.now,
      updatedAt: args.now,
    });
    return { state: "new" };
  } catch {
    const rows = await tx
      .select({
        key: v4IdempotencyKeys.key,
        userId: v4IdempotencyKeys.userId,
        requestHash: v4IdempotencyKeys.requestHash,
        status: v4IdempotencyKeys.status,
        jobId: v4IdempotencyKeys.jobId,
      })
      .from(v4IdempotencyKeys)
      .where(eq(v4IdempotencyKeys.key, args.key))
      .limit(1);
    const existing = rows[0] ?? null;
    if (!existing) {
      throw internal("V4_IDEMPOTENCY_LOOKUP_FAILED", "Unable to resolve idempotency state");
    }
    if (existing.userId !== args.userId || existing.requestHash !== args.requestHash) {
      throw conflict(
        "V4_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD",
        "Idempotency key already used with different payload",
      );
    }
    if (existing.status === "COMPLETED" && existing.jobId) {
      return { state: "completed", jobId: existing.jobId };
    }
    throw conflict("V4_IDEMPOTENCY_IN_PROGRESS", "Idempotent request is currently in progress");
  }
}

export async function createV4Job(input: V4JobCreateBody, actorUserId: string, idempotencyKey: string) {
  const now = new Date();
  const requestHash = hashV4CreateRequestPayload(input);
  assertAppraisalTokenMatchesPayload(input, actorUserId);
  let result: { ok: true; jobId: string } | null = null;

  await db.transaction(async (tx) => {
    const idem = await claimIdempotencyKeyOrThrow(tx, {
      key: idempotencyKey,
      userId: actorUserId,
      requestHash,
      now,
    });
    if (idem.state === "completed") {
      result = { ok: true, jobId: idem.jobId };
      return;
    }

    const jobId = randomUUID();
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
      // Canonical lifecycle origin for real Job Poster submissions.
      status: "OPEN_FOR_ROUTING",
      archived: false,
      title: input.title,
      scope: input.scope,
      region: resolvedProvince.toLowerCase(),
      country: deriveCountryFromRegion(resolvedProvince) ?? input.country,
      country_code: deriveCountryFromRegion(resolvedProvince) ?? input.country,
      state_code: resolvedProvince,
      region_code: resolvedProvince,
      province: resolvedProvince,
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
      cancel_request_pending: false,
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
        throw conflict("V4_APPRAISAL_TOKEN_REUSED", "Appraisal token already consumed");
      }
      throw err;
    }

    await tx
      .update(v4IdempotencyKeys)
      .set({
        status: "COMPLETED",
        jobId,
        updatedAt: now,
      })
      .where(eq(v4IdempotencyKeys.key, idempotencyKey));
    result = { ok: true, jobId };
  });

  if (!result) {
    throw internal("V4_JOB_CREATE_RESULT_MISSING", "Job creation completed without a result");
  }
  return result;
}

export { V4JobCreateBodySchema };
