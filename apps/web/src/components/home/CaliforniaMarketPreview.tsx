"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { JobCard } from "@/components/JobCard";

type CityKey =
  | "Los Angeles"
  | "San Diego"
  | "San Jose"
  | "San Francisco"
  | "Sacramento";

type MarketplaceJob = {
  id: string;
  title: string;
  region: string;
  regionCode: "CA";
  country: "US";
  city: CityKey;
  tradeCategory: string;
  serviceType: string;
  amountCents: number;
  currency: "USD" | "CAD";
  status: "IN_PROGRESS";
  updatedAt: string;
  imageUrl?: string;
  photos?: Array<{ id?: string; kind?: string; url: string | null }>;
};

const ACTIVITY_MESSAGES = [
  "Matching contractor...",
  "Routing to local pro...",
  "Assigning nearby expert...",
  "Reviewing job details...",
] as const;

const CALIFORNIA_CITIES = new Set<CityKey>([
  "Los Angeles",
  "San Diego",
  "San Jose",
  "San Francisco",
  "Sacramento",
]);

const CITY_OPTIONS: CityKey[] = [
  "Los Angeles",
  "San Diego",
  "San Jose",
  "San Francisco",
  "Sacramento",
];

function minutesAgoIso(minutesAgo: number) {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function makeFallbackJob(
  city: CityKey,
  id: string,
  title: string,
  tradeCategory: string,
  amountCents: number,
  updatedMinutesAgo: number,
): MarketplaceJob {
  return {
    id,
    title,
    region: `${city}, CA`,
    regionCode: "CA",
    country: "US",
    city,
    tradeCategory,
    serviceType: tradeCategory.toLowerCase().replace(/\s+/g, "_"),
    amountCents,
    currency: "USD",
    status: "IN_PROGRESS",
    updatedAt: minutesAgoIso(updatedMinutesAgo),
  };
}

const FALLBACK_JOBS_BY_CITY: Record<CityKey, MarketplaceJob[]> = {
  "Los Angeles": [
    makeFallbackJob("Los Angeles", "fallback-la-1", "Kitchen Sink Replacement", "Plumbing", 62000, 1),
    makeFallbackJob("Los Angeles", "fallback-la-2", "Electrical Panel Tune-Up", "Electrical", 118000, 3),
    makeFallbackJob("Los Angeles", "fallback-la-3", "Drywall Repair and Paint", "Drywall", 84000, 5),
  ],
  "San Diego": [
    makeFallbackJob("San Diego", "fallback-sd-1", "Fence Gate Rebuild", "Carpentry", 92000, 2),
    makeFallbackJob("San Diego", "fallback-sd-2", "Mini-Split Service Visit", "HVAC", 44000, 4),
    makeFallbackJob("San Diego", "fallback-sd-3", "Bathroom Tile Refresh", "Tile", 154000, 6),
  ],
  "San Jose": [
    makeFallbackJob("San Jose", "fallback-sj-1", "Exterior Paint Touch-Up", "Painting", 106000, 1),
    makeFallbackJob("San Jose", "fallback-sj-2", "Water Heater Swap", "Plumbing", 142000, 5),
    makeFallbackJob("San Jose", "fallback-sj-3", "Garage Door Sensor Repair", "Handyman", 36000, 8),
  ],
  "San Francisco": [
    makeFallbackJob("San Francisco", "fallback-sf-1", "Apartment Lighting Upgrade", "Electrical", 69000, 2),
    makeFallbackJob("San Francisco", "fallback-sf-2", "Deck Board Replacement", "Carpentry", 176000, 4),
    makeFallbackJob("San Francisco", "fallback-sf-3", "Window Trim Sealing", "Handyman", 51000, 7),
  ],
  Sacramento: [
    makeFallbackJob("Sacramento", "fallback-sac-1", "Roof Leak Inspection", "Roofing", 87000, 3),
    makeFallbackJob("Sacramento", "fallback-sac-2", "Landscape Irrigation Repair", "Landscaping", 59000, 4),
    makeFallbackJob("Sacramento", "fallback-sac-3", "Interior Door Installation", "Carpentry", 43000, 6),
  ],
};

function formatMoney(cents: number, currency: "USD" | "CAD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function relativeUpdatedLabel(updatedAt: string, nowTs: number): string {
  const timestamp = new Date(updatedAt).getTime();
  if (!Number.isFinite(timestamp)) return "Updated recently";
  const secondsAgo = Math.max(0, Math.floor((nowTs - timestamp) / 1000));
  if (secondsAgo < 60) return `Updated ${secondsAgo}s ago`;
  const minutesAgo = Math.floor(secondsAgo / 60);
  if (minutesAgo < 60) return `Updated ${minutesAgo}m ago`;
  return "Updated recently";
}

function mapApiJobToMarketplaceJob(job: Record<string, unknown>): MarketplaceJob | null {
  const city = String(job.city ?? "").trim() as CityKey;
  const status = String(job.status ?? "").trim().toUpperCase();
  const country = String(job.country ?? "US").trim().toUpperCase();
  const regionCode = String(job.regionCode ?? "CA").trim().toUpperCase();

  if (!CALIFORNIA_CITIES.has(city)) return null;
  if (country !== "US" || regionCode !== "CA") return null;
  if (status !== "IN_PROGRESS") return null;

  return {
    id: String(job.id ?? `${city}-${job.title ?? "job"}`),
    title: String(job.title ?? "Untitled Job"),
    region: String(job.regionName ?? job.region ?? `${city}, CA`),
    regionCode: "CA",
    country: "US",
    city,
    tradeCategory: String(job.tradeCategory ?? "Handyman"),
    serviceType: String(job.serviceType ?? job.tradeCategory ?? "handyman"),
    amountCents: Number(job.amountCents ?? 0),
    currency: String(job.currency ?? "USD").toUpperCase() === "CAD" ? "CAD" : "USD",
    status: "IN_PROGRESS",
    updatedAt: String(job.updatedAt ?? job.createdAt ?? new Date().toISOString()),
    imageUrl: typeof job.imageUrl === "string" ? job.imageUrl : undefined,
    photos: Array.isArray(job.photos)
      ? job.photos
          .map((photo, index) =>
            photo && typeof photo === "object"
              ? {
                  id: String((photo as { id?: string }).id ?? `${String(job.id ?? city)}-photo-${index}`),
                  kind: String((photo as { kind?: string }).kind ?? "image"),
                  url: typeof (photo as { url?: unknown }).url === "string"
                    ? (photo as { url: string }).url
                    : null,
                }
              : null,
          )
          .filter((photo): photo is { id: string; kind: string; url: string | null } => photo !== null)
      : [],
  };
}

export function CaliforniaMarketPreview() {
  const [selectedCity, setSelectedCity] = useState<CityKey>("Los Angeles");
  const [jobs, setJobs] = useState<MarketplaceJob[]>(FALLBACK_JOBS_BY_CITY["Los Angeles"]);
  const [loading, setLoading] = useState(true);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [activityTick, setActivityTick] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const [usingFallback, setUsingFallback] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadJobs() {
      setLoading(true);
      setTransitioning(true);
      try {
        const resp = await fetch(
          `/api/public/jobs/by-location?country=US&regionCode=CA&city=${encodeURIComponent(selectedCity)}&limit=6`,
          { cache: "no-store" },
        );
        const json = (await resp.json().catch(() => null)) as {
          ok?: boolean;
          jobs?: Array<Record<string, unknown>>;
          data?: { jobs?: Array<Record<string, unknown>> };
        } | null;

        const rawJobs = Array.isArray(json?.jobs)
          ? json.jobs
          : Array.isArray(json?.data?.jobs)
            ? json.data.jobs
            : [];
        const nextJobs = rawJobs
          .map(mapApiJobToMarketplaceJob)
          .filter((job): job is MarketplaceJob => job !== null);

        if (cancelled) return;
        if (nextJobs.length > 0) {
          setJobs(nextJobs);
          setUsingFallback(false);
        } else {
          setJobs(FALLBACK_JOBS_BY_CITY[selectedCity]);
          setUsingFallback(true);
        }
      } catch {
        if (!cancelled) {
          setJobs(FALLBACK_JOBS_BY_CITY[selectedCity]);
          setUsingFallback(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          window.setTimeout(() => {
            if (!cancelled) setTransitioning(false);
          }, 120);
        }
      }
    }

    void loadJobs();
    return () => {
      cancelled = true;
    };
  }, [selectedCity, refreshTick]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 30_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActivityTick((tick) => tick + 1);
    }, 5_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRefreshTick((tick) => tick + 1);
    }, 60_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const renderedJobs = useMemo(() => jobs.slice(0, 6), [jobs]);

  return (
    <section className="bg-gray-50 py-20">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-10">
          <div className="inline-flex items-center rounded-full bg-8fold-green/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-8fold-green mb-4">
            California Only
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
            Live Market Preview
          </h2>
          <p className="mt-3 text-gray-500 max-w-2xl mx-auto">
            Preview the kinds of jobs 8Fold is organizing across California right now.
          </p>
          {usingFallback ? (
            <p className="mt-2 text-sm text-gray-400">
              Live marketplace data is quiet in this region, so you are seeing the current fallback pipeline for {selectedCity}.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
          {CITY_OPTIONS.map((city) => {
            const active = city === selectedCity;
            return (
              <button
                key={city}
                type="button"
                onClick={() => setSelectedCity(city)}
                className={
                  "rounded-full px-4 py-2 text-sm font-semibold transition-colors " +
                  (active
                    ? "bg-8fold-green text-white shadow-sm"
                    : "bg-white text-gray-700 border border-gray-200 hover:border-8fold-green/50 hover:text-8fold-green")
                }
              >
                {city}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="text-center text-sm text-gray-500 mb-8">Loading California jobs in progress...</div>
        ) : null}

        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 transition-opacity duration-200 ${transitioning ? "opacity-70" : "opacity-100"}`}>
          {renderedJobs.map((job, index) => (
            <div
              key={`${selectedCity}-${job.id}-${index}`}
              className="market-card"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="mb-3 flex items-center justify-between gap-3 px-1">
                <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-8fold-green">
                  <span className="live-dot" aria-hidden="true" />
                  <span>Live</span>
                </div>
                <span className="text-sm text-gray-500">{relativeUpdatedLabel(job.updatedAt, nowTs)}</span>
              </div>
              <p className="mb-3 px-1 text-sm font-medium text-gray-500">
                {ACTIVITY_MESSAGES[(activityTick + index) % ACTIVITY_MESSAGES.length]}
              </p>
              <JobCard
                job={{
                  id: job.id,
                  title: job.title,
                  region: job.region,
                  serviceType: job.serviceType,
                  tradeCategory: job.tradeCategory,
                  country: job.country,
                  currency: job.currency,
                  amountCents: job.amountCents,
                  routerEarningsCents: 0,
                  brokerFeeCents: 0,
                  contractorPayoutCents: 0,
                  laborTotalCents: job.amountCents,
                  materialsTotalCents: 0,
                  transactionFeeCents: 0,
                  status: job.status,
                  imageUrl: job.imageUrl,
                  updatedAt: job.updatedAt,
                }}
                isAuthenticated={false}
                livePreview
              />
              <div className="mt-3 px-1 text-sm text-gray-500">
                Budget {formatMoney(job.amountCents, job.currency)} • {job.city}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/marketplace"
            className="inline-flex items-center justify-center px-7 py-3.5 rounded-xl bg-8fold-green text-white font-bold text-base hover:bg-8fold-green-dark transition-colors shadow-lg shadow-8fold-green/20"
          >
            View Available Jobs →
          </Link>
        </div>
      </div>
      <style jsx>{`
        .market-card {
          opacity: 0;
          transform: translateY(10px);
          animation: fadeInUp 0.3s ease forwards;
          transition: transform 180ms ease, box-shadow 180ms ease;
        }

        .market-card:hover {
          transform: scale(1.01) translateY(-2px);
          box-shadow: 0 16px 34px rgba(15, 23, 42, 0.08);
        }

        .live-dot {
          width: 8px;
          height: 8px;
          border-radius: 9999px;
          background-color: #22c55e;
          box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.12);
          animation: pulse 1.8s infinite;
        }

        @keyframes pulse {
          0% {
            opacity: 0.45;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.35);
          }
          100% {
            opacity: 0.45;
            transform: scale(1);
          }
        }

        @keyframes fadeInUp {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </section>
  );
}
