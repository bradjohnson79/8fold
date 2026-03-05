import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { jobPhotos } from "@/db/schema/jobPhoto";
import { z } from "zod";
import { deriveCountryFromRegion } from "@/src/jobs/jurisdictionGuard";

const TRADE_CATEGORIES = [
  "PLUMBING",
  "ELECTRICAL",
  "HVAC",
  "APPLIANCE",
  "HANDYMAN",
  "PAINTING",
  "CARPENTRY",
  "DRYWALL",
  "ROOFING",
  "JANITORIAL_CLEANING",
  "LANDSCAPING",
  "FENCING",
  "SNOW_REMOVAL",
  "JUNK_REMOVAL",
  "MOVING",
  "AUTOMOTIVE",
  "FURNITURE_ASSEMBLY",
] as const;

const BodySchema = z.object({
  title: z.string().min(1, "title is required").max(200),
  scope: z.string().min(1, "scope is required").max(10000),
  region: z.string().min(1, "region is required").max(100),
  state_code: z.string().min(1, "state_code is required").max(10),
  country: z.enum(["US", "CA"]).default("US"),
  trade_category: z
    .string()
    .refine((v) => TRADE_CATEGORIES.includes(v.toUpperCase() as (typeof TRADE_CATEGORIES)[number]), {
      message: "trade_category must be a valid TradeCategory",
    })
    .transform((v) => v.toUpperCase() as (typeof TRADE_CATEGORIES)[number]),
  job_type: z.enum(["urban", "regional"]),
  labor_total_cents: z.number().int().min(0),
  city: z.string().max(100).optional(),
  address_full: z.string().max(500).optional(),
  job_poster_user_id: z.string().max(100).optional(),
  photoUrls: z.array(z.string().url()).max(25).optional(),
});

export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.errors.map((e) => e.message).join("; ") || "Invalid request body";
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }

    const input = parsed.data;
    const now = new Date();
    const jobId = randomUUID();

    await db.transaction(async (tx) => {
      await tx.insert(jobs).values({
        id: jobId,
        // Canonical lifecycle origin for real Job Poster submissions.
        status: "OPEN_FOR_ROUTING",
        archived: false,
        title: input.title,
        scope: input.scope,
        region: input.region,
        country: deriveCountryFromRegion(input.state_code) ?? input.country,
        country_code: deriveCountryFromRegion(input.state_code) ?? input.country,
        state_code: input.state_code,
        region_code: input.state_code,
        city: input.city ?? null,
        address_full: input.address_full ?? null,
        currency: input.country === "CA" ? "CAD" : "USD",
        payment_currency: input.country === "CA" ? "cad" : "usd",
        labor_total_cents: input.labor_total_cents,
        amount_cents: input.labor_total_cents,
        job_type: input.job_type,
        trade_category: input.trade_category,
        service_type: "handyman",
        job_poster_user_id: input.job_poster_user_id ?? null,
        posted_at: now,
        published_at: now,
        created_at: now,
        updated_at: now,
      });

      const urls = input.photoUrls ?? [];
      if (urls.length > 0) {
        try {
          for (const url of urls) {
            await tx.insert(jobPhotos).values({
              id: randomUUID(),
              jobId,
              kind: "CUSTOMER_SCOPE",
              actor: "CUSTOMER",
              url,
            });
          }
        } catch (photoErr: unknown) {
          const msg = String((photoErr as Error)?.message ?? "");
          if (msg.includes("does not exist") || msg.includes("relation")) {
            await tx
              .update(jobs)
              .set({ photo_urls: urls, updated_at: now })
              .where(eq(jobs.id, jobId));
          } else {
            throw photoErr;
          }
        }
      }
    });

    return NextResponse.json({ ok: true, jobId });
  } catch (err) {
    const status = typeof (err as { status?: number })?.status === "number" ? (err as { status: number }).status : 500;
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Job create failed." },
      { status }
    );
  }
}
