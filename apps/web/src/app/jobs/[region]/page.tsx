import { notFound } from "next/navigation";
import { RegionJobsClient } from "@/components/jobs/RegionJobsClient";
import { resolveRegionSlug } from "@/utils/regionSlug";
import type { Metadata } from "next";

type Props = { params: { region: string } };

export function generateMetadata({ params }: Props): Metadata {
  const regionSlug = params.region;
  const resolved = resolveRegionSlug(regionSlug);

  const regionName =
    resolved?.regionName ??
    regionSlug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

  return {
    title: `Trade Jobs in ${regionName} | 8Fold`,
    description: `Browse available handyman, moving, plumbing and trade jobs across ${regionName}.`,
  };
}

export default function RegionJobsPage({ params }: Props) {
  const regionSlug = params.region;
  const resolved = resolveRegionSlug(regionSlug);

  if (!resolved) notFound();

  return (
    <RegionJobsClient
      country={resolved.country}
      regionCode={resolved.regionCode}
      regionSlug={regionSlug}
    />
  );
}