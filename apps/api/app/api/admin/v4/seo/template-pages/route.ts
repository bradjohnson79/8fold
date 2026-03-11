/**
 * Admin API for SEO template pages (job_page, contractor_profile, location_page, service_page).
 * Uses seo_templates table.
 */
import { z } from "zod";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok, err } from "@/src/lib/api/adminV4Response";
import { db } from "@/db/drizzle";
import { seoTemplates } from "@/db/schema/seoTemplates";
import { eq } from "drizzle-orm";

const TEMPLATE_KEYS = ["job_page", "contractor_profile", "location_page", "service_page"] as const;

const TemplateSchema = z.object({
  titleTemplate: z.string().max(300),
  descriptionTemplate: z.string().max(600),
});

const UpdateSchema = z.object({
  job_page: TemplateSchema.optional(),
  contractor_profile: TemplateSchema.optional(),
  location_page: TemplateSchema.optional(),
  service_page: TemplateSchema.optional(),
});

const DEFAULTS: Record<(typeof TEMPLATE_KEYS)[number], { titleTemplate: string; descriptionTemplate: string }> = {
  job_page: {
    titleTemplate: "{job_title} in {city}, {region} | 8Fold",
    descriptionTemplate:
      "Find trusted {trade} professionals in {city}. Post your job on 8Fold and connect with local contractors today.",
  },
  contractor_profile: {
    titleTemplate: "{contractor_name} — {trade} Contractor | 8Fold",
    descriptionTemplate: "{contractor_name} is a verified {trade} contractor available on 8Fold.",
  },
  location_page: {
    titleTemplate: "Local {trade} in {city}, {region} | 8Fold",
    descriptionTemplate:
      "Find trusted {trade} professionals in {city}. Post your job on 8Fold and connect with local contractors today.",
  },
  service_page: {
    titleTemplate: "{trade} Services | Hire Local Contractors | 8Fold",
    descriptionTemplate:
      "Find trusted {trade} professionals near you. Connect with skilled local trades through 8Fold.",
  },
};

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const rows = await db.select().from(seoTemplates);
    const byKey: Record<string, { titleTemplate: string; descriptionTemplate: string }> = {};
    for (const key of TEMPLATE_KEYS) {
      const row = rows.find((r) => r.templateKey === key);
      byKey[key] = row
        ? { titleTemplate: row.titleTemplate, descriptionTemplate: row.descriptionTemplate }
        : DEFAULTS[key];
    }
    return ok({ templates: byKey });
  } catch (e) {
    console.error("[seo/template-pages GET]", e);
    return err(500, "SEO_TEMPLATES_ERROR", "Failed to load SEO templates");
  }
}

export async function PUT(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const raw = await req.json().catch(() => null);
    const parsed = UpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return err(400, "SEO_TEMPLATES_INVALID", parsed.error.errors[0]?.message ?? "Invalid template payload");
    }

    for (const [key, data] of Object.entries(parsed.data)) {
      if (!data || typeof data !== "object" || !("titleTemplate" in data) || !("descriptionTemplate" in data)) continue;
      const existing = await db.select().from(seoTemplates).where(eq(seoTemplates.templateKey, key)).limit(1);
      if (existing[0]) {
        await db
          .update(seoTemplates)
          .set({
            titleTemplate: data.titleTemplate,
            descriptionTemplate: data.descriptionTemplate,
            updatedAt: new Date(),
          })
          .where(eq(seoTemplates.templateKey, key));
      } else {
        await db.insert(seoTemplates).values({
          templateKey: key,
          titleTemplate: data.titleTemplate,
          descriptionTemplate: data.descriptionTemplate,
        });
      }
    }

    const rows = await db.select().from(seoTemplates);
    const byKey: Record<string, { titleTemplate: string; descriptionTemplate: string }> = {};
    for (const key of TEMPLATE_KEYS) {
      const row = rows.find((r) => r.templateKey === key);
      byKey[key] = row
        ? { titleTemplate: row.titleTemplate, descriptionTemplate: row.descriptionTemplate }
        : DEFAULTS[key];
    }
    return ok({ templates: byKey });
  } catch (e) {
    console.error("[seo/template-pages PUT]", e);
    return err(500, "SEO_TEMPLATES_ERROR", "Failed to save SEO templates");
  }
}
