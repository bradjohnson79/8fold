"use client";

import React from "react";
import Link from "next/link";
import { LocationSelector } from "@/components/LocationSelector";
import { stateProvinceMap } from "@8fold/shared";

type CityWithJobs = { city: string; jobCount: number };

function titleCaseFromSlug(slug: string): string {
  return slug
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function slugCity(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, "-");
}

function getRegionName(country: "US" | "CA", regionCode: string): string {
  const code = regionCode.trim().toUpperCase();
  return (stateProvinceMap as Record<string, string>)[code] ?? regionCode;
}

export function RegionJobsClient(props: {
  country: "US" | "CA";
  regionCode: string;
  regionSlug: string;
}) {
  const { country, regionCode, regionSlug } = props;
  const regionName = getRegionName(country, regionCode);

  const [cities, setCities] = React.useState<CityWithJobs[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const resp = await fetch(
          `/api/public/jobs/cities?region=${encodeURIComponent(regionCode)}`,
          { cache: "no-store" }
        );
        const data = (await resp.json().catch(() => null)) as CityWithJobs[] | { error?: string };
        if (!resp.ok) throw new Error((data as { error?: string })?.error ?? "Failed to load cities");
        const list = Array.isArray(data) ? data : [];
        list.sort((a, b) => (b.jobCount ?? 0) - (a.jobCount ?? 0));
        if (cancelled) return;
        setCities(list);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load cities");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [regionCode]);

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <LocationSelector
          initialCountry={country}
          initialRegionCode={regionCode}
        />

        <div className="mb-8">
          <div className="text-sm font-semibold text-gray-500">Cities with Jobs</div>
          <h1 className="text-3xl font-bold text-gray-900">
            {regionName}
          </h1>
          <p className="text-gray-600 mt-2">
            Pick a city to view available jobs.
          </p>
        </div>

        {error ? (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-gray-600">
            Loading cities…
          </div>
        ) : cities.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-gray-600">
            No cities found for this region. Please pick a different location.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {cities.map((c) => (
              <Link
                key={c.city}
                href={`/jobs/${regionSlug}/${slugCity(c.city)}`}
                className="text-left px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors text-sm"
              >
                {titleCaseFromSlug(c.city)} ({c.jobCount})
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
