import { RegionJobsClient } from "@/components/jobs/RegionJobsClient";
import { resolveRegionSlug } from "@/utils/regionSlug";
import type { Metadata } from "next";

type Props = { params: Promise<{ region: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { region: regionSlug } = await params;
  const resolved = resolveRegionSlug(regionSlug);
  const regionName = resolved?.regionName ?? regionSlug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return {
    title: `Trade Jobs in ${regionName} | 8Fold`,
    description: `Browse available handyman, moving, plumbing and trade jobs across ${regionName}.`,
  };
}

export default async function RegionJobsPage({ params }: Props) {
  const { region: regionSlug } = await params;
  return <RegionJobsClient regionSlug={regionSlug} />;
}
