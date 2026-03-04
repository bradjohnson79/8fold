"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { slugCity } from "@/utils/slug";

interface CityJobCount {
  city: string;
  jobCount: number;
}

interface RegionJobsClientProps {
  country: "US" | "CA";
  regionCode: string;
  regionSlug: string;
}

export function RegionJobsClient({ country, regionCode, regionSlug }: RegionJobsClientProps) {
  const router = useRouter();
  const [cities, setCities] = useState<CityJobCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  // Derive region name from the slug for display
  const regionName = regionSlug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  useEffect(() => {
    let cancelled = false;
    async function loadCities() {
      setLoading(true);
      setError("");
      try {
        const resp = await fetch(`/api/public/jobs/cities?region=${regionCode}`, {
          cache: "no-store",
        });
        if (!resp.ok) {
          throw new Error("Failed to load cities");
        }
        const data = (await resp.json()) as CityJobCount[];
        if (!cancelled) {
          setCities(data);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load cities");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void loadCities();
    return () => {
      cancelled = true;
    };
  }, [regionCode]);

  const sortedCities = React.useMemo(
    () => [...cities].sort((a, b) => (b.jobCount ?? 0) - (a.jobCount ?? 0)),
    [cities]
  );

  const handleCityClick = (city: string) => {
    router.push(`/jobs/${country}/${regionCode}/${slugCity(city)}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="text-sm text-gray-600 mb-6">
          <Link href="/" className="hover:text-gray-900 hover:underline">
            Home
          </Link>
          <span className="mx-2">/</span>
          <Link href="/jobs" className="hover:text-gray-900 hover:underline">
            Jobs
          </Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900 font-medium">{regionName}</span>
        </nav>

        {/* Header */}
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Jobs in {regionName}
        </h1>
        <p className="text-gray-600 mb-8">
          Browse available jobs by city in {regionName}.
        </p>

        {/* Error state */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center gap-2 text-gray-500">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
            Loading cities...
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && cities.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No active jobs in this region yet.</p>
            <p className="text-gray-400 text-sm mt-2">
              Check back later or browse other regions.
            </p>
          </div>
        )}

        {/* City grid */}
        {!loading && !error && cities.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Cities with Jobs
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {sortedCities.map((c) => (
                <button
                  key={c.city}
                  type="button"
                  onClick={() => handleCityClick(c.city)}
                  className="text-left px-4 py-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors"
                >
                  <div className="font-medium text-gray-900">{c.city}</div>
                  <div className="text-sm text-gray-500">
                    {c.jobCount} {c.jobCount === 1 ? "job" : "jobs"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Back to all jobs */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <Link
            href="/jobs"
            className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
          >
            ← View all jobs
          </Link>
        </div>
      </div>
    </div>
  );
}
