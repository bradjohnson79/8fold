"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { resolveRegionSlug } from "@/utils/regionSlug";
import { slugify } from "@/utils/slug";
import { runHealthCheckIfDebug } from "@/utils/publicEndpointHealth";

interface CityJobCount {
  city: string;
  jobCount: number;
}

interface RegionJobsClientProps {
  regionSlug: string;
}

export function RegionJobsClient({ regionSlug }: RegionJobsClientProps) {
  const resolved = resolveRegionSlug(regionSlug);
  const [cities, setCities] = useState<CityJobCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const regionName = resolved?.regionName ?? regionSlug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  useEffect(() => {
    runHealthCheckIfDebug();
  }, []);

  useEffect(() => {
    if (!resolved) {
      setLoading(false);
      return;
    }
    const regionCode = resolved.regionCode;
    let cancelled = false;
    async function loadCities() {
      setLoading(true);
      setError("");
      try {
        const resp = await fetch(`/api/public/jobs/cities?region=${regionCode}`, {
          cache: "no-store",
        });
        if (!resp.ok) throw new Error("Failed to load cities");
        const data = (await resp.json()) as CityJobCount[];
        if (!cancelled) setCities(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load cities");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadCities();
    return () => {
      cancelled = true;
    };
  }, [resolved?.regionCode ?? "", !!resolved]);

  if (!resolved) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 py-12">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Region not found</h1>
          <p className="text-gray-600 mb-6">
            We couldn&apos;t find a region matching &quot;{regionSlug}&quot;.
          </p>
          <Link href="/jobs" className="text-blue-600 hover:underline font-medium">
            ← Back to Jobs
          </Link>
        </div>
      </div>
    );
  }

  const sortedCities = React.useMemo(
    () => [...cities].sort((a, b) => (b.jobCount ?? 0) - (a.jobCount ?? 0)),
    [cities]
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <nav className="text-sm text-gray-600 mb-6">
          <Link href="/" className="hover:text-gray-900 hover:underline">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/jobs" className="hover:text-gray-900 hover:underline">Jobs</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900 font-medium">{regionName}</span>
        </nav>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">Browse Cities in {regionName}</h1>
        <p className="text-gray-600 mb-8">Select a city to view available jobs.</p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">{error}</div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-gray-500">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
            Loading cities...
          </div>
        )}

        {!loading && !error && cities.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No active jobs in this region yet.</p>
            <p className="text-gray-400 text-sm mt-2">Check back later or browse other regions.</p>
          </div>
        )}

        {!loading && !error && cities.length > 0 && (
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {sortedCities.map((c) => (
                <Link
                  key={c.city}
                  href={`/jobs/${regionSlug}/${slugify(c.city)}`}
                  className="text-left px-4 py-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors block"
                >
                  <div className="font-medium text-gray-900">{c.city}</div>
                  <div className="text-sm text-gray-500">
                    {c.jobCount} {c.jobCount === 1 ? "job" : "jobs"}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-12 pt-8 border-t border-gray-200">
          <Link href="/jobs" className="text-blue-600 hover:underline font-medium">← View all jobs</Link>
        </div>
      </div>
    </div>
  );
}
