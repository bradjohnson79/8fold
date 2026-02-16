"use client";

import React from "react";
import { ErrorDisplay } from "../../../../../components/ErrorDisplay";
import { LoadingSpinner } from "../../../../../components/LoadingSpinner";

type RepeatRequest = {
  id: string;
  status: string;
  requestedAt: string;
  tradeCategory: string;
  priorJobId: string | null;
  job: { id: string; title: string; city: string | null; regionCode: string | null; status: string; laborTotalCents: number };
};

type ApiResp =
  | { contractor: { id: string; businessName: string; trade: string; regionCode: string }; requests: RepeatRequest[] }
  | { error: string };

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function prettyTrade(s: string) {
  return s.split("_").join(" ").toLowerCase().replace(/\\b\\w/g, (m) => m.toUpperCase());
}

export default function ContractorRepeatRequestsPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [rows, setRows] = React.useState<RepeatRequest[]>([]);
  const [acting, setActing] = React.useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/app/contractor/repeat-requests", { cache: "no-store" });
      const json = (await resp.json().catch(() => ({}))) as ApiResp;
      if (!resp.ok || "error" in json) throw new Error("error" in json ? json.error : "Failed to load");
      setRows(json.requests ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
  }, []);

  async function respond(id: string, decision: "ACCEPT" | "DECLINE") {
    setActing(id);
    setError("");
    try {
      const resp = await fetch(`/api/app/contractor/repeat-requests/${id}/respond`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setActing(null);
    }
  }

  return (
    <>
      <h2 className="text-lg font-bold text-gray-900">Repeat contractor requests</h2>
      <p className="text-gray-600 mt-2">
        Posters can request you directly for the same trade. Accepting enables a router-fee discount for the poster.
      </p>

      <ErrorDisplay message={error} />

      {loading ? (
        <div className="mt-6">
          <LoadingSpinner label="Loading requests…" />
        </div>
      ) : null}

      <div className="mt-6 space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="font-bold text-gray-900">{r.job.title}</div>
                <div className="text-sm text-gray-600 mt-1">
                  Trade: <span className="font-semibold">{prettyTrade(r.tradeCategory)}</span> · Labor base:{" "}
                  <span className="font-mono">{money(r.job.laborTotalCents)}</span>
                </div>
                <div className="text-xs text-gray-500 mt-2">Requested: {new Date(r.requestedAt).toLocaleString()}</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => void respond(r.id, "DECLINE")}
                  disabled={acting === r.id}
                  className="border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold px-4 py-2 rounded-lg"
                >
                  {acting === r.id ? "Working…" : "Decline"}
                </button>
                <button
                  onClick={() => void respond(r.id, "ACCEPT")}
                  disabled={acting === r.id}
                  className="bg-8fold-green text-white hover:bg-8fold-green-dark font-semibold px-4 py-2 rounded-lg"
                >
                  {acting === r.id ? "Working…" : "Accept"}
                </button>
              </div>
            </div>
          </div>
        ))}

        {!loading && rows.length === 0 ? <div className="text-sm text-gray-600">No repeat requests right now.</div> : null}
      </div>
    </>
  );
}

