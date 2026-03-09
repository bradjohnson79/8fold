import { z } from "zod";
import { randomUUID } from "crypto";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok, err } from "@/src/lib/api/adminV4Response";
import { db } from "@/db/drizzle";
import { seoPageGenerationQueue } from "@/db/schema/seoPageGenerationQueue";
import { eq } from "drizzle-orm";

const GenerateSchema = z.object({
  city: z.string().min(2).max(100),
  service: z.string().min(2).max(100),
  templateType: z.enum(["city-service", "city", "service"]).default("city-service"),
  previewData: z.object({
    slug: z.string(),
    canonicalUrl: z.string(),
    metaTitle: z.string(),
    metaDescription: z.string(),
    exampleLayout: z.record(z.unknown()).optional(),
  }),
});

export async function POST(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const raw = await req.json().catch(() => null);
    const parsed = GenerateSchema.safeParse(raw);
    if (!parsed.success) {
      return err(400, "LOCAL_SEO_GENERATE_INVALID", parsed.error.errors[0]?.message ?? "Invalid generate request");
    }

    const { city, service, templateType, previewData } = parsed.data;
    const slug = previewData.slug;

    // Check for duplicate slug
    const existing = await db
      .select({ id: seoPageGenerationQueue.id, status: seoPageGenerationQueue.status })
      .from(seoPageGenerationQueue)
      .where(eq(seoPageGenerationQueue.slug, slug))
      .limit(1);

    if (existing.length > 0) {
      return err(409, "LOCAL_SEO_DUPLICATE_SLUG", `Page for slug "${slug}" already exists with status: ${existing[0]?.status}`);
    }

    const [row] = await db
      .insert(seoPageGenerationQueue)
      .values({
        id: randomUUID(),
        city,
        service,
        slug,
        templateType,
        status: "pending",
        previewData,
        requestedBy: authed.adminId,
        createdAt: new Date(),
      })
      .returning();

    return ok({ queueEntry: row }, 201);
  } catch (e: unknown) {
    // Catch unique constraint violation at DB level as fallback
    if (e instanceof Error && e.message.includes("seo_page_unique_slug")) {
      return err(409, "LOCAL_SEO_DUPLICATE_SLUG", "A page with that slug is already queued");
    }
    console.error("[seo/local-seo/generate POST]", e);
    return err(500, "LOCAL_SEO_GENERATE_ERROR", "Failed to queue page generation");
  }
}
