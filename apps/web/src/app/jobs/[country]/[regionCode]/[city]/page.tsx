import { CityJobsClient } from "./ui";

export default async function CityJobsPage({
  params
}: {
  params: Promise<{ country: string; regionCode: string; city: string }>;
}) {
  const p = await params;
  return <CityJobsClient country={p.country} regionCode={p.regionCode} citySlug={p.city} />;
}

