/**
 * Generates SEO metadata (title, description, canonical, ogImage) for page renderers.
 * Uses seo_templates and seo_settings. Does not modify indexing logic.
 */
import { db } from "@/db/drizzle";
import { seoTemplates } from "@/db/schema/seoTemplates";
import { eq } from "drizzle-orm";
import { getSeoSettings } from "./seoSettingsService";
import { getCanonicalBase } from "./canonicalUrlService";
import { renderSeoTemplate } from "./templateRenderer";

export type JobMetadataInput = {
  id: string;
  title: string;
  city?: string | null;
  region?: string | null;
  tradeCategory?: string | null;
};

export type ContractorMetadataInput = {
  id: string;
  displayName?: string | null;
  serviceType?: string | null;
};

export type LocationMetadataInput = {
  country: string;
  region: string;
  city: string;
  service?: string | null;
};

export type MetadataResult = {
  title: string;
  description: string;
  canonical: string;
  ogImage: string;
};

const DEFAULT_PLATFORM_NAME = "8Fold";
const DEFAULT_OG_IMAGE = "https://8fold.app/og-default.png";

async function getTemplate(key: string): Promise<{ titleTemplate: string; descriptionTemplate: string } | null> {
  try {
    const [row] = await db.select().from(seoTemplates).where(eq(seoTemplates.templateKey, key)).limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}

async function getDefaultOgImage(): Promise<string> {
  const settings = await getSeoSettings();
  const url = settings?.ogImage ?? settings?.twitterCardImage;
  return url && url.trim() ? url.trim() : DEFAULT_OG_IMAGE;
}

export async function generateJobMetadata(job: JobMetadataInput): Promise<MetadataResult> {
  const base = await getCanonicalBase();
  const canonical = `${base}/jobs/${job.id}`;
  const ogImage = await getDefaultOgImage();

  const template = await getTemplate("job_page");
  const trade = job.tradeCategory
    ? String(job.tradeCategory).toLowerCase().replace(/_/g, " ")
    : "contractor";

  const variables: Record<string, string> = {
    job_title: job.title ?? "",
    city: job.city ?? "",
    region: job.region ?? "",
    trade,
    contractor_name: "",
    platform_name: DEFAULT_PLATFORM_NAME,
  };

  const titleTemplate =
    template?.titleTemplate ?? "{job_title} in {city}, {region} | 8Fold";
  const descriptionTemplate =
    template?.descriptionTemplate ??
    "Find trusted {trade} professionals in {city}. Post your job on 8Fold and connect with local contractors today.";

  return {
    title: renderSeoTemplate(titleTemplate, variables).trim() || `${job.title} | 8Fold`,
    description: renderSeoTemplate(descriptionTemplate, variables).trim() || `Job: ${job.title}`,
    canonical,
    ogImage,
  };
}

export async function generateContractorMetadata(
  contractor: ContractorMetadataInput,
): Promise<MetadataResult> {
  const base = await getCanonicalBase();
  const canonical = `${base}/contractors/${contractor.id}`;
  const ogImage = await getDefaultOgImage();

  const template = await getTemplate("contractor_profile");
  const service = contractor.serviceType ?? "contractor";

  const variables: Record<string, string> = {
    job_title: "",
    city: "",
    region: "",
    trade: service,
    contractor_name: contractor.displayName ?? "Contractor",
    platform_name: DEFAULT_PLATFORM_NAME,
  };

  const titleTemplate =
    template?.titleTemplate ?? "{contractor_name} — {trade} Contractor | 8Fold";
  const descriptionTemplate =
    template?.descriptionTemplate ??
    "{contractor_name} is a verified {trade} contractor available on 8Fold.";

  return {
    title: renderSeoTemplate(titleTemplate, variables).trim() || `${contractor.displayName ?? "Contractor"} | 8Fold`,
    description: renderSeoTemplate(descriptionTemplate, variables).trim() || `Contractor profile on 8Fold`,
    canonical,
    ogImage,
  };
}

export async function generateLocationMetadata(
  location: LocationMetadataInput,
): Promise<MetadataResult> {
  const base = await getCanonicalBase();
  const country = location.country.toLowerCase();
  const regionSlug = location.region.toLowerCase();
  const citySlug = location.city.toLowerCase().replace(/\s+/g, "-");
  const serviceSlug = location.service?.toLowerCase().replace(/\s+/g, "-") ?? "jobs";
  const canonical = `${base}/jobs/${country}/${regionSlug}/${citySlug}/${serviceSlug}`;
  const ogImage = await getDefaultOgImage();

  const template = await getTemplate("location_page");
  const service = location.service ?? "contractor";

  const variables: Record<string, string> = {
    job_title: "",
    city: location.city,
    region: location.region,
    trade: service,
    contractor_name: "",
    platform_name: DEFAULT_PLATFORM_NAME,
  };

  const titleTemplate =
    template?.titleTemplate ?? "Local {trade} in {city}, {region} | 8Fold";
  const descriptionTemplate =
    template?.descriptionTemplate ??
    "Find trusted {trade} professionals in {city}. Post your job on 8Fold and connect with local contractors today.";

  return {
    title: renderSeoTemplate(titleTemplate, variables).trim() || `${location.city} ${service} | 8Fold`,
    description: renderSeoTemplate(descriptionTemplate, variables).trim() || `Find contractors in ${location.city}`,
    canonical,
    ogImage,
  };
}
