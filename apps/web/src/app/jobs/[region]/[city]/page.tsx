import { CityJobsClient } from "@/components/jobs/CityJobsClient";
import { resolveRegionSlug } from "@/utils/regionSlug";
import { slugToTitleCase } from "@/utils/slug";
import type { Metadata } from "next";

type Props = { params: Promise<{ region: string; city: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { region: regionSlug, city: citySlug } = await params;
  const resolved = resolveRegionSlug(regionSlug);
  const regionName = resolved?.regionName ?? regionSlug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const cityName = slugToTitleCase(citySlug);
  return {
    title: `Trade Jobs in ${cityName}, ${regionName} | 8Fold`,
    description: `Browse available handyman, moving, plumbing and trade jobs in ${cityName}, ${regionName}.`,
  };
}

export default async function CityJobsPage({ params }: Props) {
  const { region: regionSlug, city: citySlug } = await params;
  return <CityJobsClient regionSlug={regionSlug} citySlug={citySlug} />;
}
