import { z } from "zod";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok, err } from "@/src/lib/api/adminV4Response";
import { getSeoSettings, updateSeoSettings } from "@/src/services/seo/seoSettingsService";

// Transform empty string to null so optional validators don't fail
const emptyToNull = (v: unknown) => (v === "" ? null : v);

const UpdateSchema = z.object({
  metaPixelId: z
    .preprocess(emptyToNull, z.string().regex(/^\d+$/, "Meta Pixel ID must contain only digits").optional().nullable()),
  ga4MeasurementId: z
    .preprocess(emptyToNull, z.string().regex(/^G-[A-Z0-9]+$/, "GA4 Measurement ID must be in G-XXXXXXXXXX format").optional().nullable()),
  indexNowKey: z
    .preprocess(emptyToNull, z.string().min(32, "IndexNow key must be at least 32 characters").max(128, "IndexNow key must be at most 128 characters").optional().nullable()),
  // canonicalDomain is normalized server-side (strips protocol, trailing slash, lowercased)
  canonicalDomain: z
    .preprocess(emptyToNull, z.string().min(1, "Enter a valid hostname").optional().nullable()),
  robotsTxt: z.preprocess(emptyToNull, z.string().optional().nullable()),
  ogImage: z.preprocess(emptyToNull, z.string().url("OG Image must be a valid URL").optional().nullable()),
  twitterCardImage: z.preprocess(emptyToNull, z.string().url("Twitter Card Image must be a valid URL").optional().nullable()),
  // Social profile URLs
  facebookUrl: z
    .preprocess(emptyToNull, z.string().refine((v) => !v || v.includes("facebook.com"), "Facebook URL must contain facebook.com").optional().nullable()),
  twitterUrl: z
    .preprocess(emptyToNull, z.string().refine((v) => !v || v.includes("x.com") || v.includes("twitter.com"), "X/Twitter URL must contain x.com or twitter.com").optional().nullable()),
  linkedinUrl: z
    .preprocess(emptyToNull, z.string().refine((v) => !v || v.includes("linkedin.com"), "LinkedIn URL must contain linkedin.com").optional().nullable()),
});

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const settings = await getSeoSettings();
  return ok(settings ?? {});
}

export async function PATCH(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err(400, "INVALID_JSON", "Request body must be valid JSON");
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.errors.map((e) => e.message).join("; ");
    return err(400, "VALIDATION_ERROR", message);
  }

  const data = parsed.data;
  console.log("[SEO_SETTINGS_UPDATE]", Object.keys(data).filter((k) => data[k as keyof typeof data] != null));

  try {
    await updateSeoSettings(data, authed.adminId);
    const updated = await getSeoSettings();
    return ok(updated ?? {});
  } catch (error) {
    console.error("[SEO_SETTINGS_PATCH_ERROR]", error);
    return err(500, "SEO_SETTINGS_SAVE_FAILED", error instanceof Error ? error.message : "Failed to save SEO settings");
  }
}
