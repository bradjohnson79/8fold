import { notFound } from "next/navigation";
import { CityJobsBySlugClient } from "./CityJobsBySlugClient";
import { resolveRegionSlug } from "@/utils/regionSlug";

function titleCaseFromSlug(slug: string): string {
  return slug
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function CityJobsBySlugPage({
  params,
}: {
  params: Promise<{ region: string; city: string }>;
}) {
  const { region: regionSlug, city: citySlug } = await params;
  const resolved = resolveRegionSlug(regionSlug);
  if (!resolved) notFound();
  const city = titleCaseFromSlug(citySlug);
  return (
    <CityJobsBySlugClient
      country={resolved.country}
      regionCode={resolved.regionCode}
      regionSlug={regionSlug}
      city={city}
      citySlug={citySlug}
    />
  );
}
