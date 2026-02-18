"use client";

import React from "react";
import { useRouter } from "next/navigation";

type RoutableJob = {
  id: string;
  title: string;
  region: string;
  tradeCategory: string;
  jobType: string;
  publishedAt?: string;
};

type EligibleContractor = {
  id: string;
  name: string;
  businessName?: string;
  trade: string;
  distanceKm: number | null;
  availability: "AVAILABLE" | "BUSY";
};

export default function RouterOpenJobsPage() {
  const router = useRouter();

  const [step, setStep] = React.useState<"jobs" | "contractors">("jobs");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const [jobs, setJobs] = React.useState<RoutableJob[]>([]);
  const [selectedJobId, setSelectedJobId] = React.useState<string | null>(null);

  const [contractors, setContractors] = React.useState<EligibleContractor[]>([]);
  const [selectedContractorIds, setSelectedContractorIds] = React.useState<string[]>([]);

  async function loadJobs() {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/app/router/routable-jobs", { cache: "no-store" });
      const json = await resp.json().catch(() => ({} as any));
      if (!resp.ok) throw new Error(json?.error ?? "Failed to load jobs");
      const rows = Array.isArray(json?.jobs) ? (json.jobs as RoutableJob[]) : [];
      setJobs(rows);
      setSelectedJobId((prev) => prev ?? (rows[0]?.id ?? null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function loadContractors(jobId: string) {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(`/api/app/router/jobs/${encodeURIComponent(jobId)}/eligible-contractors`, {
        cache: "no-store",
      });
      const json = await resp.json().catch(() => ({} as any));
      if (!resp.ok) throw new Error(json?.error || "Failed to load contractors");
      const rows = Array.isArray(json?.contractors) ? (json.contractors as EligibleContractor[]) : [];
      setContractors(rows);
      setSelectedContractorIds([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load contractors");
      setContractors([]);
      setSelectedContractorIds([]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void loadJobs();
  }, []);

  async function next() {
    if (!selectedJobId) return;
    await loadContractors(selectedJobId);
    setStep("contractors");
  }

  async function routeNow() {
    if (!selectedJobId) return;
    if (selectedContractorIds.length < 1 || selectedContractorIds.length > 5) return;
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/app/router/apply-routing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: selectedJobId, contractorIds: selectedContractorIds }),
      });
      const json = await resp.json().catch(() => ({} as any));
      if (!resp.ok) throw new Error(json?.error || "Failed to route");
      router.push("/app/router/queue");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to route");
    } finally {
      setLoading(false);
    }
  }

  function toggleContractor(id: string) {
    setSelectedContractorIds((prev) => {
      const has = prev.includes(id);
      if (has) return prev.filter((x) => x !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Open jobs in region</h2>
          <p className="text-gray-600 mt-2">Select one job, then choose 1–5 eligible contractors to route it to.</p>
        </div>
        <button
          onClick={() => void loadJobs()}
          disabled={loading}
          className="text-sm font-semibold px-3 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-500"
        >
          Refresh
        </button>
      </div>

      {error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}

      <div className="mt-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <div className={step === "jobs" ? "text-gray-900" : "text-gray-500"}>1. Select job</div>
          <div className="text-gray-400">→</div>
          <div className={step === "contractors" ? "text-gray-900" : "text-gray-500"}>2. Select contractors</div>
        </div>

        {step === "jobs" ? (
          <div className="mt-4 border border-gray-200 rounded-2xl overflow-hidden">
            {jobs.length === 0 ? (
              <div className="p-4 text-sm text-gray-600">No open jobs found in your region.</div>
            ) : (
              <div className="divide-y divide-gray-200">
                {jobs.map((j) => {
                  const selected = j.id === selectedJobId;
                  return (
                    <label
                      key={j.id}
                      className={`flex items-start gap-3 px-4 py-3 cursor-pointer ${selected ? "bg-white" : "bg-gray-50 hover:bg-white"}`}
                    >
                      <input
                        type="radio"
                        name="selectedJob"
                        checked={selected}
                        onChange={() => setSelectedJobId(j.id)}
                        className="mt-1"
                        aria-label={`Select job ${j.title}`}
                      />
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900">{j.title}</div>
                        <div className="text-xs text-gray-600 mt-1">
                          {j.tradeCategory} • {j.region} • {j.jobType}
                        </div>
                        {j.publishedAt ? (
                          <div className="text-xs text-gray-500 mt-1">
                            Published {new Date(j.publishedAt).toLocaleString()}
                          </div>
                        ) : null}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="p-4 bg-white border-t border-gray-200 flex justify-end">
              <button
                onClick={() => void next()}
                disabled={!selectedJobId || loading || jobs.length === 0}
                className="font-semibold px-4 py-2 rounded-lg bg-8fold-green text-white hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500"
              >
                Next: Select Contractor(s)
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 border border-gray-200 rounded-2xl overflow-hidden">
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <div>
                <div className="font-semibold text-gray-900">Eligible contractors</div>
                <div className="text-xs text-gray-600 mt-1">Select 1–5 contractors to route this job to.</div>
              </div>
              <button
                onClick={() => setStep("jobs")}
                disabled={loading}
                className="text-sm font-semibold px-3 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-500"
              >
                Back
              </button>
            </div>

            {contractors.length === 0 ? (
              <div className="p-4 text-sm text-gray-600">No eligible contractors available for this job.</div>
            ) : (
              <div className="divide-y divide-gray-200">
                {contractors.map((c) => {
                  const checked = selectedContractorIds.includes(c.id);
                  const distance = c.distanceKm == null ? "—" : `${c.distanceKm.toFixed(1)} km`;
                  return (
                    <label
                      key={c.id}
                      className="flex items-start gap-3 px-4 py-3 bg-white hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleContractor(c.id)}
                        className="mt-1"
                        aria-label={`Select contractor ${c.name}`}
                      />
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900">{c.name}</div>
                        <div className="text-xs text-gray-600 mt-1">
                          {c.trade} • {distance} • {c.availability === "AVAILABLE" ? "Available" : "Busy"}
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">{checked ? "Selected" : ""}</div>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="p-4 bg-white border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-600">Selected: {selectedContractorIds.length} / 5</div>
              <button
                onClick={() => void routeNow()}
                disabled={loading || selectedContractorIds.length < 1 || selectedContractorIds.length > 5}
                className="font-semibold px-4 py-2 rounded-lg bg-8fold-green text-white hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500"
              >
                Route Now
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

