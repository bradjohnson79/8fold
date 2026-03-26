"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function formatMoney(cents: number, currency: "USD" | "CAD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

type CityKey =
  | "Los Angeles"
  | "San Diego"
  | "San Jose"
  | "San Francisco"
  | "Sacramento";

type PreviewJob = {
  id?: string;
  title: string;
  budget?: string;
  amountCents?: number;
  budgetLowCents?: number;
  budgetHighCents?: number;
  currency?: "USD" | "CAD";
  category?: string | null;
  city: CityKey;
  status?: string;
  createdAt?: string;
};

const ACTIVITY_MESSAGES = [
  "Matching contractor...",
  "Routing to local pro...",
  "Assigning nearby expert...",
  "Reviewing job details...",
] as const;

const CITY_OPTIONS: CityKey[] = [
  "Los Angeles",
  "San Diego",
  "San Jose",
  "San Francisco",
  "Sacramento",
];

const JOBS_BY_CITY: Record<CityKey, PreviewJob[]> = {
  "Los Angeles": [
    { title: "Kitchen Sink Replacement", budget: "$450-$700", category: "Plumbing", city: "Los Angeles" },
    { title: "Electrical Panel Tune-Up", budget: "$900-$1,400", category: "Electrical", city: "Los Angeles" },
    { title: "Drywall Repair and Paint", budget: "$600-$950", category: "Drywall", city: "Los Angeles" },
  ],
  "San Diego": [
    { title: "Fence Gate Rebuild", budget: "$700-$1,100", category: "Carpentry", city: "San Diego" },
    { title: "Mini-Split Service Visit", budget: "$300-$520", category: "HVAC", city: "San Diego" },
    { title: "Bathroom Tile Refresh", budget: "$1,200-$1,900", category: "Tile", city: "San Diego" },
  ],
  "San Jose": [
    { title: "Exterior Paint Touch-Up", budget: "$850-$1,300", category: "Painting", city: "San Jose" },
    { title: "Water Heater Swap", budget: "$1,100-$1,700", category: "Plumbing", city: "San Jose" },
    { title: "Garage Door Sensor Repair", budget: "$250-$420", category: "Handyman", city: "San Jose" },
  ],
  "San Francisco": [
    { title: "Apartment Lighting Upgrade", budget: "$500-$880", category: "Electrical", city: "San Francisco" },
    { title: "Deck Board Replacement", budget: "$1,400-$2,100", category: "Carpentry", city: "San Francisco" },
    { title: "Window Trim Sealing", budget: "$350-$640", category: "Handyman", city: "San Francisco" },
  ],
  Sacramento: [
    { title: "Roof Leak Inspection", budget: "$650-$1,050", category: "Roofing", city: "Sacramento" },
    { title: "Landscape Irrigation Repair", budget: "$400-$780", category: "Landscaping", city: "Sacramento" },
    { title: "Interior Door Installation", budget: "$300-$560", category: "Carpentry", city: "Sacramento" },
  ],
};

export function CaliforniaMarketPreview() {
  const [selectedCity, setSelectedCity] = useState<CityKey>("Los Angeles");
  const [jobs, setJobs] = useState<PreviewJob[]>(JOBS_BY_CITY["Los Angeles"]);
  const [loading, setLoading] = useState(true);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [activityTick, setActivityTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadJobs() {
      setLoading(true);
      setJobs([]);
      try {
        const resp = await fetch(
          `/api/public/jobs/homepage-preview?city=${encodeURIComponent(selectedCity)}&limit=6`,
          { cache: "no-store" },
        );
        const json = (await resp.json().catch(() => null)) as {
          ok?: boolean;
          jobs?: PreviewJob[];
          data?: { jobs?: PreviewJob[] };
        } | null;

        const nextJobs = Array.isArray(json?.jobs)
          ? json.jobs
          : Array.isArray(json?.data?.jobs)
            ? json.data.jobs
            : [];

        if (cancelled) return;
        setJobs(nextJobs.length > 0 ? nextJobs : JOBS_BY_CITY[selectedCity]);
      } catch {
        if (!cancelled) {
          setJobs(JOBS_BY_CITY[selectedCity]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadJobs();
    return () => {
      cancelled = true;
    };
  }, [selectedCity]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 60_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActivityTick((tick) => tick + 1);
    }, 4_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const renderedJobs = useMemo(
    () => (jobs.length > 0 ? jobs : JOBS_BY_CITY[selectedCity]),
    [jobs, selectedCity],
  );

  function formatCategory(category?: string | null) {
    if (!category) return null;
    return category
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function budgetLabel(job: PreviewJob): string {
    const currency = job.currency ?? "USD";
    if (job.budgetLowCents && job.budgetHighCents) {
      return `${formatMoney(job.budgetLowCents, currency)} - ${formatMoney(job.budgetHighCents, currency)}`;
    }
    if (job.amountCents && job.amountCents > 0) {
      return formatMoney(job.amountCents, currency);
    }
    return job.budget ?? "Budget TBD";
  }

  function relativeUpdatedLabel(job: PreviewJob): string {
    if (!job.createdAt) return "Updated recently";
    const timestamp = new Date(job.createdAt).getTime();
    if (!Number.isFinite(timestamp)) return "Updated recently";

    const minutesAgo = Math.floor((nowTs - timestamp) / 60_000);
    if (minutesAgo < 1) return "Updated just now";
    if (minutesAgo < 60) return `Updated ${minutesAgo} min ago`;
    return "Updated recently";
  }

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
          <div className="text-center text-sm text-gray-500 mb-8">Loading live jobs in progress...</div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {renderedJobs.map((job, index) => (
            <div
              key={job.id ?? `${job.city}-${job.title}-${index}`}
              className="market-card rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex items-start justify-between gap-4">
                {formatCategory(job.category) ? (
                  <div className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-gray-600">
                    {formatCategory(job.category)}
                  </div>
                ) : (
                  <div />
                )}
                <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-8fold-green">
                  <span className="live-dot" aria-hidden="true" />
                  <span>Live</span>
                </div>
              </div>
              <h3 className="mt-4 text-xl font-bold text-gray-900">{job.title}</h3>
              <p className="mt-2 text-sm text-gray-500">{relativeUpdatedLabel(job)}</p>
              <p className="mt-3 text-sm text-gray-500">
                Budget Range
              </p>
              <p className="text-lg font-bold text-8fold-green">{budgetLabel(job)}</p>
              <div className="mt-6 flex items-center justify-between text-sm">
                <span className="text-gray-500">City</span>
                <span className="font-semibold text-gray-900">{job.city}</span>
              </div>
              <p className="mt-6 text-center text-sm font-medium text-gray-500">
                {ACTIVITY_MESSAGES[(activityTick + index) % ACTIVITY_MESSAGES.length]}
              </p>
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  disabled
                  className="button-glow inline-flex items-center justify-center rounded-xl border border-emerald-500/30 px-4 py-2.5 text-sm font-bold tracking-wide text-white opacity-100 cursor-not-allowed shadow-lg shadow-emerald-500/15"
                >
                  ROUTING IN PROGRESS
                </button>
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
          animation: fadeInUp 0.45s ease forwards;
          transition: transform 180ms ease, box-shadow 180ms ease;
        }

        .market-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 14px 28px rgba(15, 23, 42, 0.12);
        }

        .live-dot {
          width: 8px;
          height: 8px;
          border-radius: 9999px;
          background-color: #22c55e;
          box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.12);
          animation: pulse 1.8s infinite;
        }

        .button-glow {
          background: linear-gradient(90deg, #15803d, #22c55e, #15803d);
          background-size: 200% 100%;
          animation: shimmer 3s linear infinite;
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

        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
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
