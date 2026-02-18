"use client";

import React from "react";
import { JobCard } from "../components/JobCard";

type JobRow = {
  id: string;
  title: string;
  scope: string;
  region?: string;
  country?: "US" | "CA";
  currency?: "USD" | "CAD";
  serviceType: string;
  tradeCategory?: string;
  routerEarningsCents: number;
  brokerFeeCents: number;
  contractorPayoutCents: number;
  laborTotalCents?: number;
  materialsTotalCents?: number;
  transactionFeeCents?: number;
  status?: string;
  photos?: Array<{ url: string | null }>;
};

function getPhoto(j: JobRow): string | undefined {
  const url = j.photos?.find((p) => p.url)?.url ?? null;
  return url ?? undefined;
}

export function HomeJobFeedClient(props: {
  mode: "guest_recent" | "router_routable";
  isAuthenticated: boolean;
}) {
  const [jobs, setJobs] = React.useState<JobRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        async function fetchJson(url: string) {
          const resp = await fetch(url, { cache: "no-store" });
          const data = (await resp.json().catch(() => null)) as any;
          return { resp, data };
        }

        const primaryUrl =
          props.mode === "guest_recent" ? "/api/public/jobs/recent?limit=9" : "/api/app/router/routable-jobs";

        let { resp, data } = await fetchJson(primaryUrl);

        // If router isn't active yet, do NOT treat as an error on the homepage.
        // Fall back to a public preview feed to avoid noisy overlays during onboarding.
        if (resp.status === 403 && props.mode === "router_routable") {
          const errCode = String(data?.error ?? data?.code ?? data?.error?.code ?? "");
          const state = String(data?.state ?? data?.onboardingState ?? data?.error?.onboardingState ?? "");
          if (errCode === "router_not_ready" || errCode === "router_not_active" || state) {
            ({ resp, data } = await fetchJson("/api/public/jobs/recent?limit=9"));
          }
        }

        // Normalize error handling across both API styles:
        // - legacy: { jobs: [...] }
        // - normalized: { ok: true, data: { jobs: [...] } }
        if (!resp.ok || (data && typeof data === "object" && data.ok === false)) {
          const message =
            (data && typeof data === "object" && (data.error || data.message || data.code)) ||
            "Failed to load jobs";
          throw new Error(String(message));
        }

        const list = Array.isArray(data?.jobs)
          ? (data.jobs as JobRow[])
          : Array.isArray(data?.data?.jobs)
            ? (data.data.jobs as JobRow[])
            : [];
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
  }, [props.mode]);

  const title =
    props.mode === "guest_recent" ? "Marketplace Preview" : "Jobs Available in Your Home Region";
  const subtitle =
    props.mode === "guest_recent"
      ? "Newest jobs across the marketplace"
      : "These are ready to be routed right now";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-14">
      <div className="mb-6">
        <div className="text-sm font-semibold text-gray-500">{title}</div>
        <div className="text-2xl font-bold text-gray-900">{subtitle}</div>
      </div>

      {error ? (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-gray-600">
          Loading jobs…
        </div>
      ) : jobs.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-gray-600">
          No jobs found.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {jobs.map((j) => (
            <JobCard
              key={j.id}
              job={{
                id: j.id,
                title: j.title,
                region: j.region ?? "",
                country: (j as any).country ?? "US",
                currency: (j as any).currency,
                isMock: (j as any).isMock ?? false,
                serviceType: j.serviceType,
                tradeCategory: j.tradeCategory,
                timeWindow: undefined,
                routerEarningsCents: j.routerEarningsCents,
                brokerFeeCents: (j as any).brokerFeeCents ?? (j as any).platformFeeCents ?? 0,
                contractorPayoutCents: j.contractorPayoutCents,
                laborTotalCents: j.laborTotalCents,
                materialsTotalCents: j.materialsTotalCents,
                transactionFeeCents: j.transactionFeeCents,
                status: j.status ?? "IN_PROGRESS",
                image: getPhoto(j),
              }}
              isAuthenticated={props.isAuthenticated}
            />
          ))}
        </div>
      )}
    </div>
  );
}

