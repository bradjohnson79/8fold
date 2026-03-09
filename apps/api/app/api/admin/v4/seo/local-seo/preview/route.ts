import { z } from "zod";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok, err } from "@/src/lib/api/adminV4Response";
import { getSeoSettings } from "@/src/services/v4/seo/seoSettingsService";
import { getCanonicalBase, buildCityServiceUrl } from "@/src/services/v4/seo/canonicalUrlService";

const PreviewSchema = z.object({
  city: z.string().min(2).max(100),
  service: z.string().min(2).max(100),
  templateType: z.enum(["city-service", "city", "service"]).default("city-service"),
});

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

export async function POST(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const raw = await req.json().catch(() => null);
    const parsed = PreviewSchema.safeParse(raw);
    if (!parsed.success) {
      return err(400, "LOCAL_SEO_PREVIEW_INVALID", parsed.error.errors[0]?.message ?? "Invalid preview request");
    }

    const { city, service, templateType } = parsed.data;

    const [settings, base] = await Promise.all([
      getSeoSettings(),
      getCanonicalBase(),
    ]);

    const citySlug = city.toLowerCase().replace(/\s+/g, "-");
    const serviceSlug = service.toLowerCase().replace(/\s+/g, "-");
    const slug = `${citySlug}/${serviceSlug}`;
    const canonicalUrl = buildCityServiceUrl(base, city, service);

    const templates = settings?.pageTemplates as Record<string, { titleTemplate: string; descriptionTemplate: string }> | null;
    const defaultTitle = "{Service} in {City} | Hire Local Contractors | 8Fold";
    const defaultDesc = "Find trusted {Service} professionals in {City}. Post your job today and connect with skilled local trades through 8Fold.";

    const titleTemplate = templates?.cities?.titleTemplate ?? defaultTitle;
    const descTemplate = templates?.cities?.descriptionTemplate ?? defaultDesc;

    const vars = {
      City: city,
      Service: service,
      city: citySlug,
      service: serviceSlug,
    };

    const metaTitle = interpolate(titleTemplate, vars);
    const metaDescription = interpolate(descTemplate, vars);

    const exampleLayout = {
      h1: `${service} in ${city}`,
      intro: `Looking for reliable ${service.toLowerCase()} services in ${city}? 8Fold connects you with vetted local contractors.`,
      sections: [
        "Why choose 8Fold",
        `Top ${service} contractors in ${city}`,
        "Recent jobs in your area",
        "How to post a job",
      ],
    };

    return ok({
      preview: {
        slug,
        canonicalUrl,
        metaTitle,
        metaDescription,
        templateType,
        exampleLayout,
      },
    });
  } catch (e) {
    console.error("[seo/local-seo/preview POST]", e);
    return err(500, "LOCAL_SEO_PREVIEW_ERROR", "Failed to generate preview");
  }
}
