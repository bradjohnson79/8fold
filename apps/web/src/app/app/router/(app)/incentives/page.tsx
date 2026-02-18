"use client";

import { useEffect, useState } from "react";
import { ProgressBar } from "../../../../../components/Progress";

type RouterIncentives = {
  ok?: boolean;
  routedTotal: number;
  successfulCompletedApproved: number;
  successfulEligible: number;
  successRatePercent: number;
  incentive: {
    target: number;
    progress: number;
    eligible: boolean;
    headline: string;
    summary: string;
    benefitSummary: string;
  };
  error?: string;
};

export default function RouterIncentivesPage() {
  const [data, setData] = useState<RouterIncentives | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/app/router/incentives", { cache: "no-store" });
      const json = (await resp.json().catch(() => ({}))) as RouterIncentives;
      if (!resp.ok) throw new Error((json as any)?.error || "Failed to load");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <>
      <h2 className="text-lg font-bold text-gray-900">Incentives</h2>
      <p className="text-gray-600 mt-2">
        Route 100 jobs to successful completion to become eligible for Senior Router privileges.
      </p>

      {error ? (
        <div className="mt-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6 text-gray-600">Loading…</div>
      ) : data ? (
        <div className="mt-6 space-y-6">
          <div className="border border-gray-200 rounded-2xl p-6">
            <div className="text-xl font-bold text-gray-900">{data.incentive.headline}</div>
            <div className="text-gray-600 mt-1">{data.incentive.summary}</div>

            <div className="mt-5">
              <ProgressBar value={data.incentive.progress} max={data.incentive.target} />
              <div className="mt-2 text-sm text-gray-700">
                <span className="font-semibold">{data.incentive.progress}</span> / {data.incentive.target} successful jobs
                completed
                {data.incentive.eligible ? (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                    Eligible
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
              <Stat label="Jobs routed" value={data.routedTotal} />
              <Stat label="Successful (COMPLETED_APPROVED)" value={data.successfulCompletedApproved} />
              <Stat label="Success rate" value={`${data.successRatePercent}%`} />
            </div>

            <div className="mt-5 bg-gray-50 border border-gray-200 rounded-xl p-4">
              <div className="font-semibold text-gray-900">Senior Router benefit</div>
              <div className="text-gray-700 mt-1">{data.incentive.benefitSummary}</div>
              <div className="text-xs text-gray-500 mt-2">
                Eligibility is based on successful routes with no unresolved holds/disputes.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="text-sm text-gray-600">{label}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
    </div>
  );
}

