import { notFound } from "next/navigation";
import { RegionJobsClient } from "./RegionJobsClient";
import { resolveRegionSlug } from "@/utils/regionSlug";

export default async function RegionJobsPage({
  params,
}: {
  params: Promise<{ region: string }>;
}) {
  const { region: regionSlug } = await params;
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
