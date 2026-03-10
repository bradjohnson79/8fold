import { notFound } from "next/navigation";
import { slugToTradeCategory, slugify } from "@/utils/slug";
import { REGION_OPTIONS } from "@/lib/regions";
import { ServiceLocationJobsClient } from "./ui";

type Props = { params: Promise<{ country: string; regionCode: string; city: string; service: string }>; searchParams: Promise<{ page?: string }> };

function getRegionName(country: "US" | "CA", regionCode: string): string {
  const rc = regionCode.trim().toUpperCase();
  const options = REGION_OPTIONS[country];
  const found = options.find((r) => r.code.toUpperCase() === rc);
  return found?.name ?? regionCode;
}

function titleCaseFromSlug(slug: string): string {
  return slug
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function fetchServicePageData(
  country: "US" | "CA",
  regionCode: string,
  city: string,
  citySlug: string,
  serviceSlug: string,
  page: number,
) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_ORIGIN;
  if (!apiUrl) return null;

  const params = new URLSearchParams({
    country,
    regionCode,
    city,
    service: serviceSlug,
    page: String(page),
    limit: "9",
  });

  try {
    const res = await fetch(`${apiUrl}/api/public/jobs/by-location-service?${params.toString()}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data ?? null;
  } catch {
    return null;
  }
}

async function fetchCities(country: "US" | "CA", regionCode: string) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_ORIGIN;
  if (!apiUrl) return [];

  try {
    const res = await fetch(
      `${apiUrl}/api/public/locations/cities-with-jobs?country=${country}&regionCode=${regionCode}`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function fetchSeoSettings() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_ORIGIN;
  if (!apiUrl) return null;

  try {
    const res = await fetch(`${apiUrl}/api/public/seo-settings`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params, searchParams }: Props) {
  const p = await params;
  const sp = await searchParams;
  const country = (p.country?.toUpperCase() === "CA" ? "CA" : "US") as "US" | "CA";
  const regionCode = p.regionCode?.toUpperCase() ?? "";
  const citySlug = p.city ?? "";
  const serviceSlug = p.service ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const tradeCategory = slugToTradeCategory(serviceSlug);
  if (!tradeCategory) return { title: "Not Found" };

  const city = titleCaseFromSlug(citySlug);
  const serviceTitle = titleCaseFromSlug(serviceSlug);
  const regionName = getRegionName(country, regionCode);

  const data = await fetchServicePageData(country, regionCode, city, citySlug, serviceSlug, page);
  if (!data || data.totalJobs === 0) return { title: "Not Found" };

  const { totalJobs, totalPages } = data;
  const canonicalDomain = (await fetchSeoSettings())?.canonicalDomain ?? "8fold.app";
  const base = `https://${canonicalDomain}`;

  const canonical = `/jobs/${p.country}/${p.regionCode}/${citySlug}/${serviceSlug}`;
  const robots = totalJobs < 3 ? { index: false as const, follow: true as const } : undefined;

  const alternates: { canonical: string; prev?: string; next?: string } = {
    canonical,
  };
  if (page > 1) {
    alternates.prev = page === 2 ? canonical : `${canonical}?page=${page - 1}`;
  }
  if (page < totalPages) {
    alternates.next = `${canonical}?page=${page + 1}`;
  }

  return {
    title: `${serviceTitle} Jobs in ${city}, ${regionCode} | 8Fold`,
    description: `Browse ${serviceTitle.toLowerCase()} jobs posted by homeowners in ${city}, ${regionName}. Find repair, installation, and maintenance jobs near you.`,
    metadataBase: new URL(base),
    alternates,
    robots,
  };
}

export default async function ServiceLocationPage({ params, searchParams }: Props) {
  const p = await params;
  const sp = await searchParams;
  const country = (p.country?.toUpperCase() === "CA" ? "CA" : "US") as "US" | "CA";
  const regionCode = p.regionCode?.toUpperCase() ?? "";
  const citySlug = p.city ?? "";
  const serviceSlug = p.service ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const tradeCategory = slugToTradeCategory(serviceSlug);
  if (!tradeCategory) notFound();

  const city = titleCaseFromSlug(citySlug);

  const [data, cities] = await Promise.all([
    fetchServicePageData(country, regionCode, city, citySlug, serviceSlug, page),
    fetchCities(country, regionCode),
  ]);

  if (!data || data.totalJobs === 0) notFound();

  const regionName = getRegionName(country, regionCode);

  return (
    <ServiceLocationJobsClient
      country={country}
      regionCode={regionCode}
      regionName={regionName}
      city={city}
      citySlug={citySlug}
      serviceSlug={serviceSlug}
      serviceTitle={titleCaseFromSlug(serviceSlug)}
      jobs={data.jobs}
      page={data.page}
      totalJobs={data.totalJobs}
      totalPages={data.totalPages}
      distinctServices={data.distinctServices ?? []}
      nearbyCities={cities}
    />
  );
}
