import { z } from "zod";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok, err } from "@/src/lib/api/adminV4Response";
import { getSeoSettings, upsertSeoSettings } from "@/src/services/v4/seo/seoSettingsService";
import { getDistributionConfig } from "@/src/services/v4/seo/distributionService";

const UpdateSchema = z.object({
  facebook: z.boolean().optional(),
  linkedin: z.boolean().optional(),
  reddit: z.boolean().optional(),
  twitter: z.boolean().optional(),
});

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const config = await getDistributionConfig();
    return ok({ distribution: config });
  } catch (e) {
    console.error("[seo/distribution GET]", e);
    return err(500, "SEO_DISTRIBUTION_ERROR", "Failed to load distribution config");
  }
}

export async function PUT(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const raw = await req.json().catch(() => null);
    const parsed = UpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return err(400, "SEO_DISTRIBUTION_INVALID", parsed.error.errors[0]?.message ?? "Invalid payload");
    }

    const existing = await getSeoSettings();
    const current = (existing?.distributionConfig as Record<string, unknown> | null) ?? {};
    const merged = { ...current, ...parsed.data };

    await upsertSeoSettings({ distributionConfig: merged });
    return ok({ distribution: merged });
  } catch (e) {
    console.error("[seo/distribution PUT]", e);
    return err(500, "SEO_DISTRIBUTION_ERROR", "Failed to save distribution config");
  }
}
