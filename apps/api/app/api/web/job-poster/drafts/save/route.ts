import { NextResponse } from "next/server";
import { z } from "zod";
import { requireJobPosterReady } from "../../../../../../src/auth/onboardingGuards";
import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { jobs } from "../../../../../../db/schema/job";
import { jobPhotos } from "../../../../../../db/schema/jobPhoto";

const BodySchema = z.object({
  jobId: z.string().trim().min(10).optional(),
  jobTitle: z.string().trim().min(1).max(140).optional(),
  scope: z.string().trim().min(1).max(4000).optional(),
  tradeCategory: z.string().trim().optional(),
  jobType: z.enum(["urban", "regional"]).optional(),
  timeWindow: z.string().trim().max(80).optional(),
  items: z
    .array(
      z.object({
        category: z.string().trim().min(1).max(80),
        description: z.string().trim().min(1).max(4000),
        quantity: z.number().int().min(1).max(999),
        notes: z.string().trim().max(4000).optional(),
      })
    )
    .max(50)
    .optional(),
  photoUrls: z.array(z.string().trim().min(1).max(2048)).max(5).optional(),
  address: z
    .object({
      street: z.string().trim().min(1).max(200).optional(),
      city: z.string().trim().min(1).max(80).optional(),
      provinceOrState: z.string().trim().min(2).max(50).optional(),
      country: z.enum(["US", "CA"]).optional(),
      postalCode: z.string().trim().max(20).optional(),
    })
    .optional(),
  geo: z.object({ lat: z.number(), lng: z.number() }).optional(),
});

function slugCity(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, "-");
}

function currencyForCountry(country: "US" | "CA" | undefined): "USD" | "CAD" {
  return country === "CA" ? "CAD" : "USD";
}

export async function POST(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const user = ready;
    let bodyRaw: unknown = null;
    try {
      bodyRaw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    const parsed = BodySchema.safeParse(bodyRaw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const b = parsed.data;
    const city = (b.address?.city ?? "").trim();
    const regionCode = (b.address?.provinceOrState ?? "").trim().toUpperCase();
    const region = city && regionCode ? `${slugCity(city)}-${regionCode.toLowerCase()}` : undefined;
    const currency = currencyForCountry(b.address?.country);

    const items =
      Array.isArray(b.items) && b.items.length
        ? b.items.map((it) => ({
            category: it.category.trim(),
            description: it.description.trim(),
            quantity: Math.max(1, Math.round(it.quantity)),
            ...(it.notes ? { notes: it.notes.trim() } : {}),
          }))
        : null;
    const photoUrls =
      Array.isArray(b.photoUrls) && b.photoUrls.length
        ? b.photoUrls.map((u) => String(u || "").trim()).filter(Boolean).slice(0, 5)
        : [];

    // Create/update a Job row (draft) because the client flow expects a jobId.
    // Money fields are initialized to 0 for draft safety; later steps can overwrite.
    const data: any = {
      ...(b.jobTitle != null ? { title: b.jobTitle } : {}),
      ...(b.scope != null ? { scope: b.scope } : {}),
      ...(b.tradeCategory != null ? { tradeCategory: b.tradeCategory as any } : {}),
      ...(b.jobType != null ? { jobType: b.jobType as any } : {}),
      ...(b.timeWindow != null ? { timeWindow: b.timeWindow || null } : {}),
      ...(b.address?.country ? { country: b.address.country as any } : {}),
      ...(currency ? { currency } : {}),
      ...(city ? { city } : {}),
      ...(regionCode ? { regionCode } : {}),
      ...(b.address?.postalCode ? { postalCode: b.address.postalCode } : {}),
      ...(region ? { region } : {}),
      ...(b.geo ? { lat: b.geo.lat, lng: b.geo.lng } : {}),
      ...(items ? { junkHaulingItems: items as any } : {}),
      jobPosterUserId: user.userId,
    };

    // JobPhoto.kind is a Postgres enum ("JobPhotoKind") in the baseline schema.
    // Use canonical enum values and tag draft-photos via metadata.label instead of inventing a new kind.
    const DRAFT_PHOTO_KIND = "CUSTOMER_SCOPE";
    // Postgres enum `JobPhotoActor` is { CUSTOMER, CONTRACTOR } in current DB snapshots.
    // Job poster uploads are customer-provided scope photos.
    const DRAFT_PHOTO_ACTOR = "CUSTOMER";
    const DRAFT_PHOTO_LABEL = "JOB_POSTING_DRAFT";

    const result = await db.transaction(async (tx) => {
      let jobId = b.jobId;
      if (jobId) {
        const updated = await tx
          .update(jobs)
          .set(data)
          .where(
            and(
              eq(jobs.id, jobId),
              eq(jobs.archived, false),
              eq(jobs.jobPosterUserId, user.userId),
              eq(jobs.status, "DRAFT"),
            ),
          )
          .returning({ id: jobs.id });
        const okId = updated[0]?.id ?? null;
        if (!okId) {
          return { jobId: null as string | null };
        }
        jobId = okId;
      } else {
        const id = randomUUID();
        // Wide-insert hygiene: insert only what this step truly knows/owns; rely on DB defaults for the rest.
        if (!data.title || !data.scope || !data.region || !data.jobType || !data.tradeCategory) {
          return { jobId: null as string | null };
        }

        const inserted = await tx
          .insert(jobs)
          .values({
            id,
            status: "DRAFT",
            title: data.title,
            scope: data.scope,
            region: data.region,
            jobType: data.jobType,
            tradeCategory: data.tradeCategory,
            jobPosterUserId: user.userId,
            country: data.country ?? "US",
            currency: data.currency ?? currencyForCountry(data.country),
          })
          .returning({ id: jobs.id });
        const createdId = inserted[0]?.id ?? null;
        jobId = createdId;

        // Optional draft details are updated in a second, step-scoped write.
        if (jobId) {
          const optionalSet: any = {};
          if (data.timeWindow !== undefined) optionalSet.timeWindow = data.timeWindow;
          if (data.regionCode !== undefined) optionalSet.regionCode = data.regionCode;
          if (data.city !== undefined) optionalSet.city = data.city;
          if (data.postalCode !== undefined) optionalSet.postalCode = data.postalCode;
          if (data.lat !== undefined) optionalSet.lat = data.lat;
          if (data.lng !== undefined) optionalSet.lng = data.lng;
          if (data.junkHaulingItems !== undefined) optionalSet.junkHaulingItems = data.junkHaulingItems;
          if (Object.keys(optionalSet).length) {
            await tx.update(jobs).set(optionalSet).where(eq(jobs.id, jobId));
          }
        }
      }

      if (!jobId) return { jobId: null as string | null };

      // Sync draft photo references.
      await tx
        .delete(jobPhotos)
        .where(
          and(
            eq(jobPhotos.jobId, jobId),
            eq(jobPhotos.kind, DRAFT_PHOTO_KIND),
            eq(jobPhotos.actor, DRAFT_PHOTO_ACTOR),
            sql<boolean>`(${jobPhotos.metadata} ->> 'label') = ${DRAFT_PHOTO_LABEL}`,
          ),
        );
      for (const url of photoUrls) {
        await tx.insert(jobPhotos).values({
          id: randomUUID(),
          jobId,
          kind: DRAFT_PHOTO_KIND,
          actor: DRAFT_PHOTO_ACTOR,
          url,
          metadata: { label: DRAFT_PHOTO_LABEL } as any,
        });
      }

      return { jobId };
    });

    if (!result.jobId) {
      return NextResponse.json({ error: "Failed to save draft" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, job: { id: result.jobId } }, { status: 200 });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.error("[api job-poster drafts/save]", err);
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save draft" }, { status: 500 });
  }
}

