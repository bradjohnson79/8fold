import { z } from "zod";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok, err } from "@/src/lib/api/adminV4Response";
import { getSeoSettings, upsertSeoSettings } from "@/src/services/v4/seo/seoSettingsService";

const TemplateSchema = z.object({
  titleTemplate: z.string().max(300),
  descriptionTemplate: z.string().max(600),
});

const UpdateSchema = z.object({
  jobs: TemplateSchema.optional(),
  services: TemplateSchema.optional(),
  cities: TemplateSchema.optional(),
  contractors: TemplateSchema.optional(),
});

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const settings = await getSeoSettings();
    return ok({
      templates: (settings?.pageTemplates as Record<string, unknown> | null) ?? {
        jobs: {
          titleTemplate: "{Service} Jobs in {City} | 8Fold",
          descriptionTemplate: "Browse {Service} jobs in {City}. Post a job or apply as a contractor through 8Fold.",
        },
        services: {
          titleTemplate: "{Service} Services | Hire Local Contractors | 8Fold",
          descriptionTemplate: "Find trusted {Service} professionals near you. Connect with skilled local trades through 8Fold.",
        },
        cities: {
          titleTemplate: "Local Contractors in {City} | 8Fold",
          descriptionTemplate: "Hire trusted local contractors in {City}. Post your job today and connect with skilled tradespeople.",
        },
        contractors: {
          titleTemplate: "{ContractorName} — {Service} Contractor | 8Fold",
          descriptionTemplate: "{ContractorName} is a verified {Service} contractor available on 8Fold.",
        },
      },
    });
  } catch (e) {
    console.error("[seo/templates GET]", e);
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

    const existing = await getSeoSettings();
    const current = (existing?.pageTemplates as Record<string, unknown> | null) ?? {};
    const merged = { ...current, ...parsed.data };

    const settings = await upsertSeoSettings({ pageTemplates: merged });
    return ok({ templates: settings.pageTemplates });
  } catch (e) {
    console.error("[seo/templates PUT]", e);
    return err(500, "SEO_TEMPLATES_ERROR", "Failed to save SEO templates");
  }
}
