import { z } from "zod";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok, err } from "@/src/lib/api/adminV4Response";
import { getSeoSettings, upsertSeoSettings } from "@/src/services/v4/seo/seoSettingsService";

const UpdateSchema = z.object({
  siteTitle: z.string().max(200).optional(),
  siteDescription: z.string().max(500).optional(),
  defaultMetaTitle: z.string().max(200).optional(),
  defaultMetaDescription: z.string().max(500).optional(),
  ogTitle: z.string().max(200).optional(),
  ogDescription: z.string().max(500).optional(),
  ogImage: z.string().url().optional().or(z.literal("")),
  twitterCardImage: z.string().url().optional().or(z.literal("")),
  canonicalDomain: z.string().url().optional().or(z.literal("")),
  robotsTxt: z.string().max(10000).optional(),
  ga4MeasurementId: z.string().max(50).optional(),
  metaPixelId: z.string().max(50).optional(),
  indexNowKey: z.string().max(200).optional(),
});

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const settings = await getSeoSettings();
    return ok({ settings: settings ?? null });
  } catch (e) {
    console.error("[seo/settings GET]", e);
    return err(500, "SEO_SETTINGS_ERROR", "Failed to load SEO settings");
  }
}

export async function PUT(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const raw = await req.json().catch(() => null);
    const parsed = UpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return err(400, "SEO_SETTINGS_INVALID", parsed.error.errors[0]?.message ?? "Invalid payload");
    }

    const settings = await upsertSeoSettings(parsed.data);
    return ok({ settings });
  } catch (e) {
    console.error("[seo/settings PUT]", e);
    return err(500, "SEO_SETTINGS_ERROR", "Failed to save SEO settings");
  }
}
