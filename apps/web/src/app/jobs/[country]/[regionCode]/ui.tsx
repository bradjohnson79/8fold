"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { LocationSelector } from "../../../../components/LocationSelector";
import { slugify } from "@/utils/slug";

type CityWithJobs = { city: string; jobCount: number; latestActivity: string | null };

type RegionJob = {
  id: string;
  title: string;
  tradeCategory: string;
  city: string | null;
  status: string;
  amountCents: number;
  currency: string;
  createdAt: string;
  imageUrl: string | null;
  contractorPayoutCents: number;
  routerEarningsCents: number;
};

type ApiResponse = {
  ok: boolean;
  data?: {
    jobs: RegionJob[];
    page: number;
    limit: number;
    totalJobs: number;
    totalPages: number;
  };
  error?: { message: string };
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

function fmtMoney(cents: number, currency: string): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency === "CAD" ? "CAD" : "USD",
    maximumFractionDigits: 0,
  }).format(dollars);
}

function tradeBadgeLabel(cat: string): string {
  return cat.replace(/_/g, " ");
}

// ─── Mini Job Card ────────────────────────────────────────────────────────────

function RegionJobCard({ job }: { job: RegionJob }) {
  const [imgError, setImgError] = React.useState(false);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow flex flex-col">
      {/* Image */}
      <div className="relative h-36 bg-gray-50 flex-shrink-0">
        {job.imageUrl && !imgError ? (
          <Image
            src={job.imageUrl}
            alt={job.title}
            fill
            className="object-cover"
            onError={() => setImgError(true)}
            sizes="(max-width: 768px) 100vw, 33vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-200">
            <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="text-xs font-semibold text-blue-600 bg-blue-50 rounded-full px-2 py-0.5 shrink-0 uppercase tracking-wide">
            {tradeBadgeLabel(job.tradeCategory)}
          </span>
          {job.amountCents > 0 && (
            <span className="text-sm font-bold text-gray-900 shrink-0">
              {fmtMoney(job.amountCents, job.currency)}
            </span>
          )}
        </div>

        <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 flex-1 mb-2">{job.title}</h3>

        <div className="flex items-center justify-between text-xs text-gray-400 mt-auto">
          <span>{job.city ?? ""}</span>
          <span>{timeAgo(job.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pages: (number | "…")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("…");
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-center gap-1 mt-6">
      <button
        disabled={page === 1}
        onClick={() => onPage(page - 1)}
        className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        ← Prev
      </button>

      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} className="px-2 text-gray-400 text-sm select-none">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPage(p as number)}
            className={`w-9 h-9 text-sm rounded-lg border transition-colors ${
              p === page
                ? "bg-blue-600 border-blue-600 text-white font-bold"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {p}
          </button>
        ),
      )}

      <button
        disabled={page === totalPages}
        onClick={() => onPage(page + 1)}
        className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Next →
      </button>
    </div>
  );
}

// ─── Newest Jobs Section ──────────────────────────────────────────────────────

function NewestJobsSection({
  country,
  regionCode,
  regionName,
}: {
  country: string;
  regionCode: string;
  regionName: string;
}) {
  const [jobs, setJobs] = React.useState<RegionJob[]>([]);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalJobs, setTotalJobs] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadJobs = React.useCallback(
    async (pageNum: number) => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          country,
          regionCode,
          page: String(pageNum),
          limit: "9",
        });
        const resp = await fetch(`/api/public/jobs/by-region?${qs.toString()}`, { cache: "no-store" });
        const json: ApiResponse = await resp.json().catch(() => null);
        if (!resp.ok || !json?.ok) {
          setError(String(json?.error?.message ?? "Failed to load jobs"));
          return;
        }
        setJobs(json.data?.jobs ?? []);
        setTotalPages(json.data?.totalPages ?? 1);
        setTotalJobs(json.data?.totalJobs ?? 0);
        setPage(pageNum);
      } catch {
        setError("Failed to load jobs");
      } finally {
        setLoading(false);
      }
    },
    [country, regionCode],
  );

  React.useEffect(() => {
    void loadJobs(1);
  }, [loadJobs]);

  if (!loading && !error && jobs.length === 0) return null;

  return (
    <section className="mt-12">
      <div className="flex items-baseline gap-3 mb-5">
        <h2 className="text-2xl font-bold text-gray-900">Newest Jobs in {regionName}</h2>
        {!loading && totalJobs > 0 && (
          <span className="text-sm text-gray-500">
            {totalJobs} job{totalJobs !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      ) : loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
              <div className="h-36 bg-gray-100" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-gray-100 rounded w-1/2" />
                <div className="h-4 bg-gray-100 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-1/3 mt-3" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {jobs.map((job) => (
              <RegionJobCard key={job.id} job={job} />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onPage={(p) => void loadJobs(p)} />
        </>
      )}
    </section>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function StateJobsClient(props: { country: string; regionCode: string; regionName?: string }) {
  const country = props.country.toUpperCase() === "CA" ? "CA" : "US";
  const regionCode = props.regionCode.toUpperCase();
  const regionName = props.regionName ?? regionCode;

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
        const resp = await fetch(`/api/public/locations/cities-with-jobs?${qs.toString()}`, {
          cache: "no-store",
        });
        const data = (await resp.json().catch(() => null)) as any;
        if (!resp.ok) throw new Error(data?.error ?? "Failed to load cities");
        const list: CityWithJobs[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.cities)
            ? data.cities
            : [];
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
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-gray-600">
            Loading cities…
          </div>
        ) : cities.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-gray-600">
            No cities found for this region. Please pick a different location.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cities.map((c) => {
              const ago = timeAgo(c.latestActivity);
              return (
                <Link
                  key={c.city}
                  href={`/jobs/${country}/${regionCode}/${slugify(c.city)}`}
                  className="block border border-gray-200 rounded-2xl p-4 hover:shadow-sm transition-shadow"
                >
                  <div className="font-bold text-gray-900">{c.city}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    {c.jobCount} {c.jobCount === 1 ? "job" : "jobs"}
                    {ago && <span className="text-gray-400 ml-1">&middot; {ago}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Newest jobs in this region with pagination */}
        <NewestJobsSection country={country} regionCode={regionCode} regionName={regionName} />
      </div>
    </main>
  );
}
