"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type PmRequest = {
  id: string;
  jobId: string;
  status: string;
  subtotal?: string;
  tax?: string;
  total?: string;
  createdAt?: string;
};

export default function ContractorPmPage() {
  const searchParams = useSearchParams();
  const preselectedJob = searchParams.get("job") ?? "";
  const [requests, setRequests] = useState<PmRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [createMode, setCreateMode] = useState(!!preselectedJob);
  const [jobId, setJobId] = useState(preselectedJob);
  const [items, setItems] = useState<{ description: string; quantity: number; unitPriceCents: number }[]>([
    { description: "", quantity: 1, unitPriceCents: 0 },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/api/web/v4/pm/requests?role=contractor", {
          cache: "no-store",
          credentials: "include",
        });
        if (resp.ok) {
          const data = (await resp.json()) as { requests?: PmRequest[] };
          setRequests(Array.isArray(data.requests) ? data.requests : []);
        }
      } catch {
        setRequests([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const parsed = items
        .filter((i) => i.description.trim())
        .map((i) => ({
          description: i.description.trim(),
          quantity: Math.max(1, i.quantity),
          unitPriceCents: Math.max(0, i.unitPriceCents),
        }));
      if (parsed.length === 0) {
        setError("Add at least one item with description.");
        return;
      }
      const resp = await fetch("/api/web/v4/pm/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ jobId: jobId.trim(), items: parsed }),
      });
      const result = (await resp.json().catch(() => ({}))) as { id?: string; error?: string };
      if (resp.ok && result.id) {
        setCreateMode(false);
        setJobId("");
        setItems([{ description: "", quantity: 1, unitPriceCents: 0 }]);
        setRequests((prev) => [...prev, { id: result.id!, jobId: jobId.trim(), status: "DRAFT", total: "0" }]);
      } else {
        setError(result?.error ?? "Failed to create");
      }
    } catch {
      setError("Failed to create");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSend(id: string) {
    setSending(id);
    try {
      const resp = await fetch(`/api/web/v4/pm/requests/${id}/send`, {
        method: "POST",
        credentials: "include",
      });
      if (resp.ok) {
        setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: "SENT" } : r)));
      }
    } finally {
      setSending(null);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">P&M</h1>
        <p className="mt-2 text-gray-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">P&M</h1>
      <p className="mt-1 text-gray-600">Create and manage P&M requests.</p>

      {createMode ? (
        <form onSubmit={handleCreate} className="mt-6 max-w-xl space-y-4">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700">Job ID</label>
            <input
              type="text"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              placeholder="Job ID"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Items</label>
            {items.map((item, idx) => (
              <div key={idx} className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={item.description}
                  onChange={(e) =>
                    setItems((prev) => {
                      const next = [...prev];
                      next[idx] = { ...next[idx]!, description: e.target.value };
                      return next;
                    })
                  }
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2"
                  placeholder="Description"
                />
                <input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) =>
                    setItems((prev) => {
                      const next = [...prev];
                      next[idx] = { ...next[idx]!, quantity: Number(e.target.value) || 1 };
                      return next;
                    })
                  }
                  className="w-20 rounded-md border border-gray-300 px-3 py-2"
                />
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={item.unitPriceCents / 100}
                  onChange={(e) =>
                    setItems((prev) => {
                      const next = [...prev];
                      next[idx] = { ...next[idx]!, unitPriceCents: Math.round(Number(e.target.value) * 100) || 0 };
                      return next;
                    })
                  }
                  className="w-24 rounded-md border border-gray-300 px-3 py-2"
                  placeholder="Price $"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setItems((prev) => [...prev, { description: "", quantity: 1, unitPriceCents: 0 }])}
              className="mt-2 text-sm text-gray-600 hover:underline"
            >
              + Add item
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create"}
            </button>
            <button
              type="button"
              onClick={() => setCreateMode(false)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setCreateMode(true)}
          className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800"
        >
          New P&M Request
        </button>
      )}

      <div className="mt-8 space-y-4">
        <h2 className="font-semibold">Your Requests</h2>
        {requests.length === 0 ? (
          <p className="text-gray-500">No P&M requests yet.</p>
        ) : (
          requests.map((r) => (
            <div key={r.id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Link href={`/dashboard/contractor/jobs/${r.jobId}`} className="font-medium text-blue-600 hover:underline">
                    Job {r.jobId.slice(0, 8)}
                  </Link>
                  <span className="ml-2 text-sm text-gray-500">{r.status}</span>
                  {r.total != null && <span className="ml-2 text-sm">${r.total}</span>}
                </div>
                {r.status === "DRAFT" && (
                  <button
                    type="button"
                    onClick={() => handleSend(r.id)}
                    disabled={sending === r.id}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {sending === r.id ? "Sending…" : "Send"}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
