"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { resolveRegionSlug } from "@/utils/regionSlug";
import { slugToTitleCase } from "@/utils/slug";
import { LocationSelector } from "@/components/LocationSelector";
import { JobCard } from "@/components/JobCard";

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

interface CityJobsClientProps {
  regionSlug: string;
  citySlug: string;
}

export function CityJobsClient({ regionSlug, citySlug }: CityJobsClientProps) {
  const resolved = resolveRegionSlug(regionSlug);
  const cityName = slugToTitleCase(citySlug);

  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!resolved) {
      setLoading(false);
      return;
    }
    const { country, regionCode } = resolved;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const qs = new URLSearchParams({
          country,
          regionCode,
          city: cityName,
        });
        const resp = await fetch(`/api/public/jobs/by-location?${qs.toString()}`, { cache: "no-store" });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.error ?? "Failed to load jobs");
        const list = Array.isArray(data?.jobs) ? (data.jobs as PublicJob[]) : [];
        if (!cancelled) setJobs(list);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load jobs");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [resolved?.country ?? "", resolved?.regionCode ?? "", cityName]);

  if (!resolved) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 py-12">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Region not found</h1>
          <p className="text-gray-600 mb-6">We couldn&apos;t find a region matching &quot;{regionSlug}&quot;.</p>
          <Link href="/jobs" className="text-blue-600 hover:underline font-medium">← Back to Jobs</Link>
        </div>
      </div>
    );
  }

  const regionName = resolved.regionName ?? regionSlug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <LocationSelector
          initialCountry={resolved.country}
          initialRegionCode={resolved.regionCode}
          initialCity={cityName}
        />
        <div className="mb-8">
          <nav className="text-sm text-gray-600 mb-2">
            <Link href="/" className="hover:text-gray-900 hover:underline">Home</Link>
            <span className="mx-2">/</span>
            <Link href="/jobs" className="hover:text-gray-900 hover:underline">Jobs</Link>
            <span className="mx-2">/</span>
            <Link href={`/jobs/${regionSlug}`} className="hover:text-gray-900 hover:underline">{regionName}</Link>
            <span className="mx-2">/</span>
            <span className="text-gray-900 font-medium">{cityName}</span>
          </nav>
          <h1 className="text-3xl font-bold text-gray-900">
            Trade Jobs in {cityName}, {regionName}
          </h1>
          <p className="text-gray-600 mt-2">Browse available jobs in {cityName}, {regionName}.</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
        )}

        {loading ? (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-gray-600">Loading jobs…</div>
        ) : jobs.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-gray-600">
            No jobs found for this city. Please go back and pick a different location.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {jobs.map((j) => {
              const photo = j.imageUrl ?? j.photos?.find((p) => p.url)?.url ?? null;
              const regionSlugLegacy = `${citySlug}-${resolved.regionCode.toLowerCase()}`;
              return (
                <JobCard
                  key={j.id}
                  job={{
                    id: j.id,
                    title: j.title ?? "Untitled",
                    region: j.region ?? regionSlugLegacy,
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
