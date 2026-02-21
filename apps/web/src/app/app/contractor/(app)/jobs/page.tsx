"use client";

import React from "react";

type ActiveAppointmentResponse = {
  ok?: boolean;
  active?: {
    job: {
      id: string;
      title: string;
      region?: string | null;
      status?: string | null;
      paymentStatus?: string | null;
    };
  } | null;
};

type OffersResponse = {
  ok?: boolean;
  offers?: Array<{
    dispatchId: string;
    status: string;
    job: {
      id: string;
      title: string;
      region?: string | null;
      status?: string | null;
    };
  }>;
};

export default function ContractorJobsPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [active, setActive] = React.useState<ActiveAppointmentResponse["active"]>(null);
  const [offers, setOffers] = React.useState<NonNullable<OffersResponse["offers"]>>([]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [activeResp, offersResp] = await Promise.all([
          fetch("/api/app/contractor/appointment", { cache: "no-store", credentials: "include" }),
          fetch("/api/app/contractor/offers", { cache: "no-store", credentials: "include" }),
        ]);
        const activeJson = (await activeResp.json().catch(() => ({}))) as ActiveAppointmentResponse;
        const offersJson = (await offersResp.json().catch(() => ({}))) as OffersResponse;
        if (!alive) return;
        if (!activeResp.ok) throw new Error((activeJson as any)?.error ?? "Failed to load active job");
        if (!offersResp.ok) throw new Error((offersJson as any)?.error ?? "Failed to load offers");
        setActive(activeJson?.active ?? null);
        setOffers(Array.isArray(offersJson?.offers) ? offersJson.offers : []);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load jobs");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <h2 className="text-lg font-bold text-gray-900">Assigned Jobs</h2>
      <p className="mt-2 text-gray-600">
        Open a job&apos;s Parts &amp; Materials page to manage requests and receipts.
      </p>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? <div className="mt-6 text-gray-600">Loading jobs…</div> : null}

      {!loading && active?.job ? (
        <div className="mt-6 rounded-2xl border border-gray-200 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Active Job</div>
              <div className="font-bold text-gray-900">{active.job.title}</div>
              <div className="mt-1 text-sm text-gray-600">
                Status: <span className="font-mono">{String(active.job.status ?? "—")}</span>
              </div>
            </div>
            <a
              href={`/app/contractor/jobs/${encodeURIComponent(active.job.id)}/materials`}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Parts &amp; Materials
            </a>
          </div>
        </div>
      ) : null}

      {!loading && offers.length ? (
        <div className="mt-6 space-y-3">
          {offers.map((o) => (
            <div key={o.dispatchId} className="rounded-xl border border-gray-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-gray-900">{o.job.title}</div>
                  <div className="mt-1 text-sm text-gray-600">
                    Status: <span className="font-mono">{String(o.job.status ?? o.status)}</span>
                  </div>
                </div>
                <a
                  href={`/app/contractor/jobs/${encodeURIComponent(o.job.id)}/materials`}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Parts &amp; Materials
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!loading && !active?.job && !offers.length ? (
        <div className="mt-6 text-sm text-gray-600">No contractor jobs found.</div>
      ) : null}
    </>
  );
}

