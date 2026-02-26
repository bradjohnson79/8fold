"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

type ApprovedRequest = {
  id: string;
  jobId: string;
  status: string;
  approvedTotalCents?: number;
  total?: string;
};

export default function ContractorReceiptsPage() {
  const [approved, setApproved] = useState<ApprovedRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingFor, setSubmittingFor] = useState<string | null>(null);
  const [receiptTotals, setReceiptTotals] = useState<Record<string, string>>({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ decision: string; diffCents: number } | null>(null);

  const fetchApproved = async () => {
    try {
      const resp = await fetch("/api/v4/pm/approved", {
        cache: "no-store",
        credentials: "include",
      });
      if (resp.ok) {
        const data = (await resp.json()) as { requests?: ApprovedRequest[] };
        setApproved(Array.isArray(data.requests) ? data.requests : []);
      }
    } catch {
      setApproved([]);
    }
  };

  useEffect(() => {
    fetchApproved().finally(() => setLoading(false));
  }, []);

  async function handleUpload(pmRequestId: string) {
    setUploadError(null);
    setLastResult(null);
    const dollars = receiptTotals[pmRequestId] ?? "";
    const total = Math.round(parseFloat(dollars || "0") * 100);
    if (total < 0) {
      setUploadError("Receipt total must be >= 0");
      return;
    }
    setSubmittingFor(pmRequestId);
    try {
      const resp = await fetch("/api/v4/pm/receipts/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          pmRequestId,
          uploadId: `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          receiptTotalCents: total,
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as { decision?: string; diffCents?: number; error?: string };
      if (resp.ok) {
        setLastResult({ decision: data.decision ?? "NONE", diffCents: data.diffCents ?? 0 });
        setReceiptTotals((prev) => ({ ...prev, [pmRequestId]: "" }));
      } else {
        setUploadError(data?.error ?? "Upload failed");
      }
    } catch {
      setUploadError("Upload failed");
    } finally {
      setSubmittingFor(null);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Receipts</h1>
        <p className="mt-2 text-gray-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Receipts</h1>
      <p className="mt-1 text-gray-600">Submit receipt totals for approved P&M requests. Difference ≤$20 → CREDIT, &gt;$20 → REFUND.</p>

      {lastResult && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
          Result: {lastResult.decision} (difference: ${(lastResult.diffCents / 100).toFixed(2)})
        </div>
      )}

      <div className="mt-6 space-y-4">
        {approved.length === 0 ? (
          <p className="text-gray-500">No approved P&M requests. Receipts can be submitted once a request is approved.</p>
        ) : (
          approved.map((r) => (
            <div key={r.id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Link href={`/dashboard/contractor/jobs/${r.jobId}`} className="font-medium text-blue-600 hover:underline">
                    Job {r.jobId.slice(0, 8)}
                  </Link>
                  <span className="ml-2 text-sm text-gray-500">
                    Approved: ${r.approvedTotalCents != null ? (r.approvedTotalCents / 100).toFixed(2) : r.total ?? "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={receiptTotals[r.id] ?? ""}
                    onChange={(e) => setReceiptTotals((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    placeholder="Receipt total $"
                    className="w-28 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => handleUpload(r.id)}
                    disabled={submittingFor === r.id || !(receiptTotals[r.id] ?? "").trim()}
                    className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {submittingFor === r.id ? "…" : "Submit"}
                  </button>
                </div>
              </div>
              {uploadError && submittingFor === r.id && (
                <p className="mt-2 text-sm text-red-600">{uploadError}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
