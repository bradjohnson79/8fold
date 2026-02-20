"use client";

import React from "react";
import Link from "next/link";
import { LocationSelector } from "../../../../components/LocationSelector";

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

export function StateJobsClient(props: { country: string; regionCode: string }) {
  const country = props.country.toUpperCase() === "CA" ? "CA" : "US";
  const regionCode = props.regionCode.toUpperCase();

  const [cities, setCities] = React.useState<CityWithJobs[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const qs = new URLSearchParams({ country, regionCode });
        const resp = await fetch(`/api/public/locations/cities-with-jobs?${qs.toString()}`, { cache: "no-store" });
        const data = (await resp.json().catch(() => null)) as any;
        if (!resp.ok) throw new Error(data?.error ?? "Failed to load cities");
        const list = Array.isArray(data) ? (data as CityWithJobs[]) : Array.isArray(data?.cities) ? (data.cities as CityWithJobs[]) : [];
        list.sort((a, b) => a.city.localeCompare(b.city, undefined, { sensitivity: "base" }));
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
  }, [country, regionCode]);

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <LocationSelector initialCountry={country} initialRegionCode={regionCode} />

        <div className="mb-8">
          <div className="text-sm font-semibold text-gray-500">Jobs</div>
          <h1 className="text-3xl font-bold text-gray-900">
            {regionCode} ({country})
          </h1>
          <p className="text-gray-600 mt-2">{`Pick a city/town in ${regionCode} to view jobs.`}</p>
        </div>

        {error ? (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
        ) : null}

        {loading ? (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-gray-600">Loading cities…</div>
        ) : cities.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-gray-600">
            No cities found for this region. Please pick a different location.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cities.map((c) => (
              <Link
                key={c.city}
                href={`/jobs/${country}/${regionCode}/${slugCity(c.city)}`}
                className="block border border-gray-200 rounded-2xl p-4 hover:shadow-sm transition-shadow"
              >
                <div className="font-bold text-gray-900">{titleCaseFromSlug(c.city)}</div>
                <div className="text-sm text-gray-600 mt-1">{c.jobCount} jobs</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

