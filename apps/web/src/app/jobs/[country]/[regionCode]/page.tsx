import { StateJobsClient } from "./ui";

export default async function StateJobsPage({
  params
}: {
  params: Promise<{ country: string; regionCode: string }>;
}) {
  const p = await params;
  return <StateJobsClient country={p.country} regionCode={p.regionCode} />;
}

