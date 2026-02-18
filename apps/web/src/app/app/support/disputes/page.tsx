"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SupportTabs } from "../SupportTabs";

function supportBase(pathname: string): string {
  const idx = pathname.indexOf("/support");
  if (idx < 0) return "/app/support";
  return pathname.slice(0, idx) + "/support";
}

type Dispute = {
  id: string;
  createdAt: string;
  updatedAt: string;
  ticketId: string;
  jobId: string;
  status: string;
  disputeReason: string;
  againstRole: string;
  ticketSubject: string;
  deadlineAt: string;
  decisionAt: string | null;
  decision: string | null;
};

export default function SupportDisputesPage() {
  const path = usePathname();
  const base = supportBase(path);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [disputes, setDisputes] = React.useState<Dispute[]>([]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/app/support/disputes", { cache: "no-store" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(json?.error ?? "Failed to load disputes");
      const list = Array.isArray(json?.data?.disputes) ? json.data.disputes : Array.isArray(json?.disputes) ? json.disputes : [];
      setDisputes(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Support</h2>
          <p className="text-gray-600 mt-1">Formal disputes freeze payout until resolution.</p>
        </div>
        <button
          onClick={() => void load()}
          className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-900 font-semibold px-4 py-2 rounded-lg"
        >
          Refresh
        </button>
      </div>

      <SupportTabs showDisputes={true} />

      <div className="flex items-center gap-3 flex-wrap">
        <Link href={`${base}/dispute`} className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-4 py-2 rounded-lg">
          Open new dispute
        </Link>
        <Link href={`${base}/tickets`} className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-900 font-semibold px-4 py-2 rounded-lg">
          View tickets
        </Link>
      </div>

      {error ? <div className="text-red-600 font-semibold">{error}</div> : null}
      {loading ? <div className="text-gray-600">Loading…</div> : null}

      {!loading && disputes.length === 0 ? (
        <div className="text-gray-600">No disputes for this account.</div>
      ) : null}

      <div className="space-y-3">
        {disputes.map((d) => (
          <Link
            key={d.id}
            href={`${base}/disputes/${encodeURIComponent(d.id)}`}
            className="block border border-gray-200 rounded-2xl p-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="font-bold text-gray-900">⚖️ {d.ticketSubject || "Dispute"}</div>
              <div className="text-sm text-gray-600">Status: {d.status}</div>
            </div>
            <div className="text-sm text-gray-600 mt-2">
              Reason: {d.disputeReason} • Job {d.jobId} • Updated {new Date(d.updatedAt).toLocaleString()}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

