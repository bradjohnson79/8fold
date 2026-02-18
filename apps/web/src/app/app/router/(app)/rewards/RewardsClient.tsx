"use client";

import { useEffect, useMemo, useState } from "react";

type RewardsStats = {
  ok: true;
  totalReferredUsers: number;
  completedReferredJobs: number;
  pendingRewards: number;
  paidRewards: number;
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="text-sm text-gray-600">{label}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
    </div>
  );
}

export function RewardsClient(props: { referralLink: string }) {
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<RewardsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const displayLink = useMemo(() => props.referralLink, [props.referralLink]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(props.referralLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // fall back to error UI
      setError("Could not copy. Please copy the link manually.");
    }
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/app/router/rewards", { cache: "no-store", credentials: "include" });
      const json = (await resp.json().catch(() => null)) as any;
      if (!resp.ok) throw new Error(String(json?.error ?? "Failed to load"));
      if (!json || json.ok !== true) throw new Error(String(json?.error ?? "Failed to load"));
      setStats(json as RewardsStats);
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
      <h2 className="text-lg font-bold text-gray-900">Referral Rewards</h2>
      <p className="text-gray-600 mt-2 max-w-3xl">
        Share your referral link. When a Job Poster or Contractor signs up through your link and completes their first job,
        a $5 reward is deducted from the platform fee for that job and added to your router earnings.
      </p>

      <div className="mt-6 border border-gray-200 rounded-2xl p-6 bg-white">
        <div className="font-semibold text-gray-900">Referral link</div>
        <div className="mt-2 flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex-1 min-w-0 font-mono text-sm bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 truncate">
            {displayLink}
          </div>
          <button
            type="button"
            onClick={copyLink}
            className="px-4 py-2 rounded-xl bg-gray-900 text-white font-semibold hover:bg-black transition-colors"
          >
            {copied ? "Copied" : "Copy Referral Link"}
          </button>
        </div>
        {error ? (
          <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
        ) : null}
        <div className="mt-3 text-xs text-gray-500">
          Referrals are tracked via a cookie (`router_ref`) for 30 days. Rewards are automated and can only be earned once per
          referred user.
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <div className="font-semibold text-gray-900">Rewards stats</div>
          <button
            type="button"
            onClick={() => void load()}
            className="text-sm font-semibold text-gray-700 hover:text-black"
          >
            Refresh
          </button>
        </div>

        {loading ? <div className="mt-3 text-gray-600">Loading…</div> : null}

        {!loading && stats ? (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-4">
            <Stat label="Total referred users" value={stats.totalReferredUsers} />
            <Stat label="Completed referred jobs" value={stats.completedReferredJobs} />
            <Stat label="Pending rewards" value={stats.pendingRewards} />
            <Stat label="Paid rewards (lifetime)" value={stats.paidRewards} />
          </div>
        ) : null}
      </div>
    </>
  );
}

