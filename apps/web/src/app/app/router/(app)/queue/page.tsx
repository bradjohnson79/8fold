"use client";

import React from "react";

type QueueJob = {
  id: string;
  title: string;
  region: string;
  tradeCategory: string;
  routedContractorCount: number;
  expiresAt: string | null;
  timeRemainingSeconds: number;
  status: "AWAITING_CONTRACTOR_RESPONSE" | "EXPIRED";
};

function missingLabel(k: string) {
  if (k === "TERMS") return "Accept Router Terms & Conditions";
  if (k === "PROFILE") return "Complete your profile";
  if (k === "HOME_REGION") return "Set your home state/province";
  return k;
}

function formatRemaining(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h}:${pad(m)}:${pad(ss)}`;
}

export default function RouterQueuePage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [blocked, setBlocked] = React.useState(false);
  const [missing, setMissing] = React.useState<string[]>([]);
  const [jobs, setJobs] = React.useState<QueueJob[]>([]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/app/router/routed-jobs", { cache: "no-store" });
      const json = await resp.json().catch(() => ({} as any));
      setBlocked(Boolean(json?.blocked));
      setMissing(Array.isArray(json?.missing) ? (json.missing as string[]) : []);
      const rows = Array.isArray(json?.jobs) ? (json.jobs as QueueJob[]) : [];
      setJobs(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
  }, []);

  React.useEffect(() => {
    if (blocked) return;
    const t = setInterval(() => {
      setJobs((prev) =>
        prev.map((j) =>
          j.status === "AWAITING_CONTRACTOR_RESPONSE"
            ? { ...j, timeRemainingSeconds: Math.max(0, j.timeRemainingSeconds - 1) }
            : j,
        ),
      );
    }, 1000);
    return () => clearInterval(t);
  }, [blocked]);

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Routing queue</h2>
          <p className="text-gray-600 mt-2">
            Jobs you routed in the last 24 hours. Expired routing automatically recycles jobs back to Open.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="text-sm font-semibold px-3 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-500"
        >
          Refresh
        </button>
      </div>

      {blocked ? (
        <div className="mt-5 border border-amber-200 bg-amber-50 rounded-2xl p-4">
          <div className="font-semibold text-amber-900">Routing tools are locked</div>
          <div className="text-sm text-amber-800 mt-1">To access Routing Queue, please complete:</div>
          <ul className="list-disc pl-5 text-sm text-amber-800 mt-2">
            {missing.map((m) => (
              <li key={m}>{missingLabel(m)}</li>
            ))}
          </ul>
          <div className="mt-3">
            <a
              href="/app/router/profile"
              className="inline-flex items-center font-semibold px-4 py-2 rounded-lg bg-8fold-green text-white hover:bg-8fold-green-dark"
            >
              Go to Profile
            </a>
          </div>
        </div>
      ) : null}

      {error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}

      {!blocked ? (
        <div className="mt-6 border border-gray-200 rounded-2xl overflow-hidden bg-white">
          {loading ? (
            <div className="p-4 text-sm text-gray-600">Loading…</div>
          ) : jobs.length === 0 ? (
            <div className="p-4 text-sm text-gray-600">No jobs in your routing queue.</div>
          ) : (
            <div className="divide-y divide-gray-200">
              {jobs.map((j) => {
                const statusLabel =
                  j.status === "AWAITING_CONTRACTOR_RESPONSE" ? "Awaiting contractor response" : "Expired";
                const statusClass =
                  j.status === "AWAITING_CONTRACTOR_RESPONSE"
                    ? "text-blue-700 bg-blue-50 border-blue-200"
                    : "text-gray-700 bg-gray-50 border-gray-200";
                return (
                  <div key={j.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-semibold text-gray-900">{j.title}</div>
                        <div className="text-xs text-gray-600 mt-1">
                          {j.tradeCategory} • {j.region} • Routed to {j.routedContractorCount} contractor
                          {j.routedContractorCount === 1 ? "" : "s"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border ${statusClass}`}
                        >
                          {statusLabel}
                        </div>
                        {j.status === "AWAITING_CONTRACTOR_RESPONSE" ? (
                          <div className="mt-2 text-sm font-mono text-gray-900">
                            {formatRemaining(j.timeRemainingSeconds)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}

