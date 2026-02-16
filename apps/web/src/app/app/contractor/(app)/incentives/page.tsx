"use client";

import { useEffect, useState } from "react";
import { IncentiveBadge, ProgressBar } from "../../../../../components/Progress";

type ContractorIncentives = {
  hasContractor: boolean;
  contractor?: { id: string; businessName: string };
  waiverAccepted: boolean;
  completedApproved: number;
  eligibleCompletedApproved: number;
  incentive: null | {
    target: number;
    progress: number;
    unlocked: boolean;
    status: "LOCKED" | "IN_PROGRESS" | "COMPLETED_AWAITING_ADMIN";
    headline: string;
    summary: string;
  };
  error?: string;
};

export default function ContractorIncentivesPage() {
  const [data, setData] = useState<ContractorIncentives | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/app/contractor/incentives", { cache: "no-store" });
      const json = (await resp.json().catch(() => ({}))) as ContractorIncentives;
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

  const incentive = data?.incentive ?? null;

  return (
    <>
      <h2 className="text-lg font-bold text-gray-900">Incentives</h2>
      <p className="text-gray-600 mt-2">Track your progress toward contractor incentives (placeholder).</p>

      {error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="mt-6 text-gray-600">Loading…</div> : null}

      {!loading && data && !data.hasContractor ? (
        <div className="mt-6 text-gray-700">No contractor profile found for this account.</div>
      ) : null}

      {!loading && data && data.hasContractor ? (
        <div className="mt-6 space-y-6">
          <div className="border border-gray-200 rounded-2xl p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="text-sm text-gray-500">Contractor</div>
                <div className="font-bold text-gray-900">{data.contractor?.businessName ?? "—"}</div>
              </div>
              <div className="flex items-center gap-2">
                <IncentiveBadge status={incentive?.status ?? "LOCKED"} />
              </div>
            </div>

            <div className="mt-4">
              <div className="text-sm font-semibold text-gray-900">{incentive?.headline ?? "Incentive locked"}</div>
              <div className="text-sm text-gray-600 mt-1">{incentive?.summary ?? "Complete eligible jobs to unlock."}</div>
            </div>

            <div className="mt-5">
              <ProgressBar
                value={incentive?.progress ?? 0}
                max={incentive?.target ?? 0}
              />
              <div className="mt-2 text-xs text-gray-500">
                Eligible completed + approved jobs: {data.eligibleCompletedApproved} / {incentive?.target ?? "—"}
              </div>
              <div className="mt-2 text-xs text-gray-500">
                Completed + approved (all): {data.completedApproved} · Eligible: {data.eligibleCompletedApproved}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

