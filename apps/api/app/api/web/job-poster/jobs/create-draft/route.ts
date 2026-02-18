import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../db/schema/auditLog";
import { jobPhotos } from "../../../../../../db/schema/jobPhoto";
import { jobPosterProfiles } from "../../../../../../db/schema/jobPosterProfile";
import { jobs } from "../../../../../../db/schema/job";
import { eq } from "drizzle-orm";
import { requireJobPosterReady } from "../../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../../src/http/errors";
import { JobPostingInputSchema } from "@8fold/shared";
import { appraiseJobPrice } from "../../../../../../src/pricing/aiAppraisal";
import { validateJobLocationMatchesProfile } from "../../../../../../src/jobs/location";
import { geocodeAddress } from "../../../../../../src/jobs/location";
import { calculatePayoutBreakdown } from "@8fold/shared";
import { PRICING_VERSION } from "../../../../../../src/pricing/constants";
import { rateLimit } from "../../../../../../src/middleware/rateLimit";
import { getRegionDatasets, getRegionName } from "../../../../../../src/locations/datasets";
import { validateAndNormalizePostalCode } from "../../../../../../src/locations/postal";
import { ensureActiveAccount } from "../../../../../../src/server/accountGuard";

export async function POST(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const user = ready;
    await ensureActiveAccount(user.userId);
    const rl = rateLimit({
      key: `job_posting:create_draft:${user.userId}`,
      limit: 10,
      windowMs: 60 * 60 * 1000
    });
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Rate limited. Please try again shortly." },
        { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds) } }
      );
    }

    // Profile already validated by requireJobPosterReady; fetch for location validation
    const profileRows = await db
      .select({
        address: jobPosterProfiles.address,
        city: jobPosterProfiles.city,
        stateProvince: jobPosterProfiles.stateProvince,
        country: jobPosterProfiles.country,
      })
      .from(jobPosterProfiles)
      .where(eq(jobPosterProfiles.userId, user.userId))
      .limit(1);
    const profile = profileRows[0] ?? null;
    if (!profile) {
      return NextResponse.json({ error: "Profile required" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = JobPostingInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      jobTitle,
      scope,
      tradeCategory,
      jobType,
      timeWindow,
      address: addr,
      items,
      photoUrls,
      geo: providedGeo,
    } = parsed.data;

    const city = addr.city;
    const stateProvinceRaw = addr.provinceOrState;
    const address = addr.street;
    const postalCode = addr.postalCode ?? "";
    const junkHaulingItems = (items ?? []).map((it: any) => ({
      category: it.category,
      item: it.description,
      quantity: it.quantity,
      notes: it.notes,
    }));

    const country2 = profile.country === "CA" ? "CA" : "US";
    if (addr.country !== country2) {
      return NextResponse.json(
        { error: "Address country must match your profile country." },
        { status: 400 }
      );
    }

    function canonicalRegionCode(country: "CA" | "US", v: string): string {
      const raw = String(v ?? "").trim();
      if (!raw) return "";
      const norm = raw.toUpperCase().replace(/[\s._-]+/g, "");
      const dataset = getRegionDatasets().find((d) => d.country === country);
      if (!dataset) return raw.toUpperCase();
      // Accept both "BC" and "British Columbia" (and similar).
      for (const r of dataset.regions) {
        const codeNorm = String(r.regionCode).toUpperCase().replace(/[\s._-]+/g, "");
        const nameNorm = String(r.regionName).toUpperCase().replace(/[\s._-]+/g, "");
        if (norm === codeNorm || norm === nameNorm) return String(r.regionCode).toUpperCase();
      }
      return raw.toUpperCase();
    }

    const stateProvince = canonicalRegionCode(country2, stateProvinceRaw);
    const profileProvince = canonicalRegionCode(country2, String(profile.stateProvince ?? ""));

    // Validate location matches profile (canonicalized to 2-letter code when possible).
    const locationCheck = validateJobLocationMatchesProfile(stateProvince, profileProvince);
    if (!locationCheck.valid) {
      return NextResponse.json(
        { error: locationCheck.error },
        { status: 400 }
      );
    }

    // Build region string (city-state format)
    const region = `${city.toLowerCase().replace(/\s+/g, "-")}-${stateProvince.toLowerCase()}`;
    const normalizedPostal = validateAndNormalizePostalCode(country2, postalCode);
    if (postalCode && !normalizedPostal) {
      return NextResponse.json(
        {
          error:
            country2 === "US"
              ? "Invalid ZIP code. Expected 12345 or 12345-6789."
              : "Invalid postal code. Expected A1A 1A1."
        },
        { status: 400 }
      );
    }

    // Geocode location
    const geo = providedGeo ?? (await geocodeAddress(address ?? null, city, stateProvince, country2));

    if (!geo) {
      return NextResponse.json(
        { error: "Unable to geocode job location. Please check address and try again." },
        { status: 400 }
      );
    }

    // Perform AI appraisal (sync for v1; UI can show a loading state)
    const appraisal = await appraiseJobPrice({
      tradeCategory: tradeCategory as any,
      jobType: jobType as any,
      city,
      province: stateProvince,
      scope,
      title: jobTitle,
      junkHaulingItems: junkHaulingItems,
    });

    const breakdown = calculatePayoutBreakdown(appraisal.priceMedianCents, 0);

    const jobId = crypto.randomUUID();
    await db.transaction(async (tx) => {
      // Minimal insert (draft step).
      await tx.insert(jobs).values({
        id: jobId,
        status: "DRAFT",
        jobSource: "REAL",
        isMock: false,
        title: jobTitle,
        scope,
        region,
        country: profile.country,
        tradeCategory: tradeCategory as any,
        jobType: jobType as any,
        jobPosterUserId: user.userId,
      } as any);

      // Location + display fields (step-owned).
      await tx
        .update(jobs)
        .set({
          regionCode: stateProvince.toUpperCase(),
          regionName: getRegionName(country2, stateProvince.toUpperCase()) ?? null,
          city,
          postalCode: normalizedPostal,
          addressFull: address ?? null,
          serviceType: String(tradeCategory).toLowerCase().replace(/_/g, " "),
          lat: geo.lat,
          lng: geo.lng,
          timeWindow: timeWindow ?? null,
        } as any)
        .where(eq(jobs.id, jobId));

      // Pricing fields (pricing step-owned, but this legacy endpoint is synchronous appraisal).
      await tx
        .update(jobs)
        .set({
          laborTotalCents: breakdown.laborTotalCents,
          materialsTotalCents: 0,
          transactionFeeCents: breakdown.transactionFeeCents,
          contractorPayoutCents: breakdown.contractorPayoutCents,
          routerEarningsCents: breakdown.routerEarningsCents,
          brokerFeeCents: breakdown.platformFeeCents,
          priceMedianCents: appraisal.priceMedianCents,
          priceAdjustmentCents: 0,
          pricingVersion: PRICING_VERSION,
          junkHaulingItems: (junkHaulingItems.length ? junkHaulingItems : null) as any,
        } as any)
        .where(eq(jobs.id, jobId));

      // Photo refs (if provided).
      if (photoUrls?.length) {
        await tx.insert(jobPhotos).values(
          photoUrls.map((url: string) => ({
            id: crypto.randomUUID(),
            jobId,
            kind: "CUSTOMER_SCOPE",
            // Postgres enum `JobPhotoActor` is { CUSTOMER, CONTRACTOR } in current DB snapshots.
            actor: "CUSTOMER",
            url,
            metadata: { label: "JOB_POSTING_DRAFT", city, stateProvince } as any,
            createdAt: new Date(),
          })),
        );
      }

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: user.userId,
        action: "JOB_POSTING_DRAFT_CREATED",
        entityType: "Job",
        entityId: jobId,
        metadata: {
          title: jobTitle,
          tradeCategory,
          region,
          priceMedianCents: appraisal.priceMedianCents,
          allowedDeltaCents: appraisal.allowedDeltaCents,
          pricingReasoning: appraisal.reasoning,
        } as any,
      });
    });

    return NextResponse.json(
      {
        job: {
          id: jobId,
          status: "DRAFT",
          priceMedianCents: appraisal.priceMedianCents,
          allowedDeltaCents: appraisal.allowedDeltaCents,
          reasoning: appraisal.reasoning,
          breakdown: {
            laborTotalCents: breakdown.laborTotalCents,
            materialsTotalCents: breakdown.materialsTotalCents,
            transactionFeeCents: breakdown.transactionFeeCents,
            contractorPayoutCents: breakdown.contractorPayoutCents,
            routerEarningsCents: breakdown.routerEarningsCents,
            platformFeeCents: breakdown.platformFeeCents,
            totalJobPosterPaysCents: breakdown.totalJobPosterPaysCents
          }
        },
      },
      { status: 201 }
    );
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
