import { z } from "zod";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok, err } from "@/src/lib/api/adminV4Response";
import { getSeoSettings, updateSeoSettings } from "@/src/services/seo/seoSettingsService";

const UpdateSchema = z.object({
  metaPixelId: z
    .string()
    .regex(/^\d+$/, "Meta Pixel ID must contain only digits")
    .optional()
    .nullable(),
  ga4MeasurementId: z
    .string()
    .regex(/^G-[A-Z0-9]+$/, "GA4 Measurement ID must be in G-XXXXXXXXXX format")
    .optional()
    .nullable(),
  indexNowKey: z
    .string()
    .min(32, "IndexNow key must be at least 32 characters")
    .max(128, "IndexNow key must be at most 128 characters")
    .optional()
    .nullable(),
  // canonicalDomain is normalized server-side (strips protocol, trailing slash, lowercased)
  canonicalDomain: z
    .string()
    .min(1)
    .optional()
    .nullable(),
  robotsTxt: z.string().optional().nullable(),
  ogImage: z.string().url("OG Image must be a valid URL").optional().nullable(),
  twitterCardImage: z.string().url("Twitter Card Image must be a valid URL").optional().nullable(),
});

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const settings = await getSeoSettings();
  return ok(settings ?? null);
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

  await updateSeoSettings(parsed.data, authed.adminId);
  const updated = await getSeoSettings();
  return ok(updated);
}
