"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ProgressBar } from "../../../../../../../components/Progress";

type MaterialsItem = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unitPriceCents: number;
  priceUrl: string | null;
};

type MaterialsResponse = {
  request: null | {
    id: string;
    status: "SUBMITTED" | "APPROVED" | "ESCROWED" | "RECEIPTS_SUBMITTED" | "REIMBURSED" | "DECLINED";
    currency: "USD" | "CAD";
    totalAmountCents: number;
    submittedAt: string;
    approvedAt: string | null;
    declinedAt: string | null;
    items: MaterialsItem[];
    escrow: null | {
      status: "HELD" | "RELEASED";
      amountCents: number;
      releaseDueAt: string | null;
      releasedAt: string | null;
    };
    receipts: null | {
      id: string;
      status: "DRAFT" | "SUBMITTED";
      receiptSubtotalCents: number;
      receiptTaxCents: number;
      receiptTotalCents: number;
      submittedAt: string | null;
      files: Array<{ id: string; originalName: string; mimeType: string; sizeBytes: number; storageKey: string }>;
    };
  };
  viewer: { isContractor: boolean };
  error?: string;
};

function money(cents: number, currency: string) {
  const amt = (cents / 100).toFixed(2);
  return currency === "CAD" ? `C$${amt}` : `$${amt}`;
}

export default function ContractorMaterialsPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<MaterialsResponse | null>(null);
  const [receiptsUploading, setReceiptsUploading] = useState(false);
  const [receiptsSubmitting, setReceiptsSubmitting] = useState(false);
  const [ack, setAck] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(`/api/app/materials/by-job?jobId=${encodeURIComponent(jobId)}`, { cache: "no-store" });
      const json = (await resp.json().catch(() => ({}))) as MaterialsResponse;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const req = data?.request ?? null;
  const currency = req?.currency ?? "USD";
  const totalCents = req?.totalAmountCents ?? 0;

  const escrowPct = useMemo(() => {
    const held = req?.escrow?.status === "HELD";
    if (!held) return 0;
    const amt = req?.escrow?.amountCents ?? 0;
    return totalCents > 0 ? Math.round((amt / totalCents) * 100) : 0;
  }, [req?.escrow?.status, req?.escrow?.amountCents, totalCents]);

  async function uploadReceipts(files: FileList | null) {
    if (!files?.length || !req?.receipts?.id) return;
    setReceiptsUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("submissionId", req.receipts.id);
      for (const f of Array.from(files)) form.append("files", f);
      const resp = await fetch(`/api/app/materials/${encodeURIComponent(jobId)}/receipts/upload`, { method: "POST", body: form });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Upload failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setReceiptsUploading(false);
    }
  }

  async function submitReceipts() {
    if (!req?.receipts?.id) return;
    setReceiptsSubmitting(true);
    setError("");
    try {
      const resp = await fetch(`/api/app/materials/${encodeURIComponent(jobId)}/receipts/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submissionId: req.receipts.id }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Submit failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setReceiptsSubmitting(false);
    }
  }

  return (
    <>
      <h2 className="text-lg font-bold text-gray-900">Materials</h2>
      <p className="text-gray-600 mt-2">Track materials requests and upload receipts (placeholder).</p>

      {error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="mt-6 text-gray-600">Loading…</div> : null}

      {!loading && !req ? <div className="mt-6 text-gray-700">No materials request found for this job.</div> : null}

      {!loading && req ? (
        <div className="mt-6 space-y-6">
          <div className="border border-gray-200 rounded-2xl p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="text-sm text-gray-500">Request status</div>
                <div className="font-bold text-gray-900">{req.status}</div>
              </div>
              <div className="text-sm text-gray-700 font-mono">{money(req.totalAmountCents, currency)}</div>
            </div>

            {req.escrow?.status === "HELD" ? (
              <div className="mt-5">
                <ProgressBar value={escrowPct} max={100} />
                <div className="mt-2 text-xs text-gray-500">
                  Escrow held: {money(req.escrow.amountCents, currency)}
                </div>
              </div>
            ) : null}

            <div className="mt-5">
              <div className="text-sm font-semibold text-gray-900">Items</div>
              <div className="mt-3 space-y-2">
                {req.items.map((it) => (
                  <div key={it.id} className="border border-gray-200 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-semibold text-gray-900">{it.name}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          Category: {it.category} · Qty: {it.quantity}
                        </div>
                      </div>
                      <div className="text-sm font-mono text-gray-800">{money(it.unitPriceCents * it.quantity, currency)}</div>
                    </div>
                    {it.priceUrl ? (
                      <a className="mt-2 inline-block text-sm text-8fold-green hover:text-8fold-green-dark font-semibold" href={it.priceUrl} target="_blank" rel="noreferrer">
                        Price link →
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {req.receipts ? (
            <div className="border border-gray-200 rounded-2xl p-6">
              <div className="text-sm font-bold text-gray-900">Receipts</div>
              <div className="text-sm text-gray-600 mt-1">Upload receipts to request reimbursement.</div>

              <div className="mt-4 flex items-center gap-3">
                <input
                  type="file"
                  multiple
                  disabled={receiptsUploading || receiptsSubmitting}
                  onChange={(e) => void uploadReceipts(e.target.files)}
                />
              </div>

              <div className="mt-4 text-xs text-gray-500">
                Uploaded files: {req.receipts.files?.length ?? 0} · Status: {req.receipts.status}
              </div>

              <div className="mt-4 flex items-start gap-3">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1" />
                <div className="text-sm text-gray-700">
                  I confirm these receipts are accurate and correspond to this materials request.
                </div>
              </div>

              <button
                disabled={!ack || receiptsSubmitting || req.receipts.status !== "DRAFT"}
                onClick={() => void submitReceipts()}
                className="mt-4 bg-8fold-green hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500 text-white font-semibold px-5 py-2.5 rounded-lg"
              >
                {receiptsSubmitting ? "Submitting…" : "Submit receipts"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

