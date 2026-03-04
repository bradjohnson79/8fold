import { notFound } from "next/navigation";
import { RegionJobsClient } from "@/components/jobs/RegionJobsClient";
import { resolveRegionSlug } from "@/utils/regionSlug";
import type { Metadata } from "next";

export async function generateMetadata(props: {
  params: Promise<{ region: string }>;
}): Promise<Metadata> {
  const { region: regionSlug } = await props.params;
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

export default async function RegionJobsPage(props: {
  params: Promise<{ region: string }>;
}) {
  const { region: regionSlug } = await props.params;
  const resolved = resolveRegionSlug(regionSlug);

  if (!resolved) notFound();

  return <RegionJobsClient regionSlug={regionSlug} />;
}
