"use client";

import { useEffect, useMemo, useState } from "react";

type Item = {
  job: { id: string; title: string; region: string; status: string };
  estimatedCompletionDate: string;
  checkInSentAt: string;
};

type ApiResp = { ok: true; items: Item[] } | { error: string };

type Response = "COMPLETED" | "IN_PROGRESS" | "ISSUE";

export function EcdCheckInsCard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/app/job-poster/checkins", { cache: "no-store", credentials: "include" });
      const json = (await resp.json().catch(() => ({}))) as ApiResp;
      if (!resp.ok || "error" in json) throw new Error("error" in json ? json.error : "Failed to load");
      setItems(json.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const empty = useMemo(() => !loading && !error && items.length === 0, [loading, error, items.length]);

  async function respond(jobId: string, response: Response) {
    setSubmitting(jobId);
    setError("");
    try {
      const resp = await fetch("/api/app/job-poster/checkins/respond", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ jobId, response })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="border border-gray-200 rounded-2xl p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Job Status Check-ins</h2>
          <p className="text-gray-600 mt-1">
            If a job is running past its estimate, we’ll ask for a quick update. This helps everyone stay aligned — no penalties.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold px-4 py-2 rounded-lg"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
      ) : null}

      {loading ? <div className="mt-6 text-gray-600">Loading…</div> : null}

      {empty ? <div className="mt-6 text-gray-600">No check-ins right now.</div> : null}

      {!loading && items.length > 0 ? (
        <div className="mt-6 space-y-3">
          {items.map((it) => (
            <div key={it.job.id} className="border border-gray-200 rounded-xl p-4 bg-white">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="font-bold text-gray-900">{it.job.title}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Estimated completion date: <span className="font-semibold">{it.estimatedCompletionDate}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Check-in triggered: {new Date(it.checkInSentAt).toLocaleString()}
                  </div>
                </div>

                <div className="flex flex-col md:flex-row gap-2">
                  <button
                    onClick={() => void respond(it.job.id, "COMPLETED")}
                    disabled={submitting === it.job.id}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-500 text-white font-semibold px-4 py-2 rounded-lg"
                  >
                    ✅ Job completed
                  </button>
                  <button
                    onClick={() => void respond(it.job.id, "IN_PROGRESS")}
                    disabled={submitting === it.job.id}
                    className="bg-gray-900 hover:bg-black disabled:bg-gray-200 disabled:text-gray-500 text-white font-semibold px-4 py-2 rounded-lg"
                  >
                    ⏳ Still in progress
                  </button>
                  <button
                    onClick={() => void respond(it.job.id, "ISSUE")}
                    disabled={submitting === it.job.id}
                    className="bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-200 disabled:text-gray-500 text-white font-semibold px-4 py-2 rounded-lg"
                  >
                    ⚠️ Issue / need help
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

