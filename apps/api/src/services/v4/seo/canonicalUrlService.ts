import { getSeoSettings } from "./seoSettingsService";

function normalizeDomain(domain: string): string {
  return domain.replace(/\/$/, "");
}

function getBaseDomain(canonicalDomain: string | null | undefined): string {
  if (canonicalDomain && canonicalDomain.startsWith("http")) {
    return normalizeDomain(canonicalDomain);
  }
  return "https://8fold.app";
}

export async function getCanonicalBase(): Promise<string> {
  const settings = await getSeoSettings();
  return getBaseDomain(settings?.canonicalDomain);
}

export function buildJobUrl(base: string, jobId: string): string {
  return `${base}/jobs/${jobId}`;
}

export function buildContractorUrl(base: string, contractorId: string): string {
  return `${base}/contractors/${contractorId}`;
}

export function buildCityServiceUrl(base: string, city: string, service: string): string {
  const citySlug = city.toLowerCase().replace(/\s+/g, "-");
  const serviceSlug = service.toLowerCase().replace(/\s+/g, "-");
  return `${base}/${citySlug}/${serviceSlug}`;
}

export function buildCityUrl(base: string, city: string): string {
  const citySlug = city.toLowerCase().replace(/\s+/g, "-");
  return `${base}/${citySlug}`;
}

export function buildServiceUrl(base: string, service: string): string {
  const serviceSlug = service.toLowerCase().replace(/\s+/g, "-");
  return `${base}/services/${serviceSlug}`;
}

export async function resolveJobUrl(jobId: string): Promise<string> {
  const base = await getCanonicalBase();
  return buildJobUrl(base, jobId);
}

export async function resolveContractorUrl(contractorId: string): Promise<string> {
  const base = await getCanonicalBase();
  return buildContractorUrl(base, contractorId);
}

export async function resolveCityServiceUrl(city: string, service: string): Promise<string> {
  const base = await getCanonicalBase();
  return buildCityServiceUrl(base, city, service);
}
