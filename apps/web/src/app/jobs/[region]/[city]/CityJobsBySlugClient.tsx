"use client";

import React from "react";
import { LocationSelector } from "@/components/LocationSelector";
import { JobCard } from "@/components/JobCard";
import { stateProvinceMap } from "@8fold/shared";

type PublicJob = {
  id: string;
  status?: string;
  title?: string;
  scope?: string;
  regionName?: string | null;
  city: string | null;
  region: string;
  regionCode: string;
  country: "US" | "CA";
  currency?: "USD" | "CAD";
  publicStatus?: "OPEN" | "IN_PROGRESS";
  serviceType?: string;
  tradeCategory?: string;
  routerEarningsCents?: number;
  brokerFeeCents?: number;
  contractorPayoutCents?: number;
  laborTotalCents?: number;
  materialsTotalCents?: number;
  transactionFeeCents?: number;
  publishedAt?: string;
  createdAt?: string;
  imageUrl?: string;
  photos: Array<{ id: string; kind: string; url: string | null }>;
};

function getRegionName(country: "US" | "CA", regionCode: string): string {
  const code = regionCode.trim().toUpperCase();
  return (stateProvinceMap as Record<string, string>)[code] ?? regionCode;
}

export function CityJobsBySlugClient(props: {
  country: "US" | "CA";
  regionCode: string;
  regionSlug: string;
  city: string;
  citySlug: string;
}) {
  const { country, regionCode, regionSlug, city } = props;
  const regionName = getRegionName(country, regionCode);

  const [jobs, setJobs] = React.useState<PublicJob[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const qs = new URLSearchParams({ country, regionCode, city });
        const resp = await fetch(`/api/public/jobs/by-location?${qs.toString()}`, { cache: "no-store" });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.error ?? "Failed to load jobs");
        const list = Array.isArray(data?.jobs) ? (data.jobs as PublicJob[]) : [];
        if (cancelled) return;
        setJobs(list);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load jobs");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [country, regionCode, city]);

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <LocationSelector initialCountry={country} initialRegionCode={regionCode} initialCity={city} />
        <div className="mb-8">
          <div className="text-sm font-semibold text-gray-500">Jobs</div>
          <h1 className="text-3xl font-bold text-gray-900">
            {city}, {regionName}
          </h1>
          <p className="text-gray-600 mt-2">
            Jobs currently being worked on in {city}, {regionName}
          </p>
        </div>

        {error ? (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
        ) : null}

        {loading ? (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-gray-600">
            Loading jobs…
          </div>
        ) : jobs.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-gray-600">
            No jobs found for this city. Please go back and pick a different location.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {jobs.map((j) => {
              const photo = j.imageUrl ?? j.photos?.find((p) => p.url)?.url ?? null;
              const regionSlugForCard = `${props.citySlug}-${regionCode.toLowerCase()}`;
              return (
                <JobCard
                  key={j.id}
                  job={{
                    id: j.id,
                    title: j.title ?? "Untitled",
                    region: j.region ?? regionSlugForCard,
                    country: j.country,
                    currency: ((j as { currency?: string }).currency ?? (j.country === "CA" ? "CAD" : "USD")) as "USD" | "CAD",
                    isMock: (j as { isMock?: boolean }).isMock ?? false,
                    serviceType: j.serviceType ?? "handyman",
                    tradeCategory: j.tradeCategory ?? "",
                    timeWindow: undefined,
                    amountCents: (j as { amountCents?: number }).amountCents ?? 0,
                    routerEarningsCents: j.routerEarningsCents ?? 0,
                    brokerFeeCents: j.brokerFeeCents ?? 0,
                    contractorPayoutCents: j.contractorPayoutCents ?? 0,
                    laborTotalCents: j.laborTotalCents ?? 0,
                    materialsTotalCents: j.materialsTotalCents ?? 0,
                    transactionFeeCents: j.transactionFeeCents ?? 0,
                    status: j.status ?? "PUBLISHED",
                    image: photo ?? undefined,
                  }}
                  isAuthenticated={false}
                />
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
