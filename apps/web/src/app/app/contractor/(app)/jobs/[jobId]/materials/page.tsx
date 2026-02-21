"use client";

import type { PMStatus } from "@8fold/shared";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { formatMoney, pmBadgeClassByStatus } from "@/lib/pmStatus";

type PMLineItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: string;
  url?: string | null;
  lineTotal: string;
};

type PMReceipt = {
  id: string;
  extractedTotal: string | null;
  verified: boolean;
};

type PMRequest = {
  id: string;
  status: PMStatus;
  autoTotal: string;
  manualTotal: string | null;
  approvedTotal: string | null;
  taxAmount: string | null;
  currency: string;
  lineItems: PMLineItem[];
  receipts: PMReceipt[];
  updatedAt: string;
};

type PMListResponse = { requests: PMRequest[]; error?: string; traceId?: string };
type ContractorAppointmentResponse = {
  active?: { job?: { id: string; status?: string | null; title?: string | null } | null } | null;
};

function parseError(json: any, fallback: string): string {
  const msg = String(json?.error ?? fallback);
  const trace = json?.traceId ? ` (traceId: ${String(json.traceId)})` : "";
  return `${msg}${trace}`;
}

function decimal(v: string | number | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export default function ContractorMaterialsPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = String(params?.jobId ?? "");

  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);
  const [error, setError] = useState("");
  const [jobStatus, setJobStatus] = useState<string>("");
  const [jobTitle, setJobTitle] = useState<string>("");
  const [requests, setRequests] = useState<PMRequest[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [draftLine, setDraftLine] = useState({ description: "", quantity: 1, unitPrice: "", url: "" });
  const [taxAmount, setTaxAmount] = useState("0");
  const [manualTotal, setManualTotal] = useState("");

  const openDraft = useMemo(
    () => requests.find((r) => r.status === "DRAFT" || r.status === "AMENDMENT_REQUESTED") ?? null,
    [requests],
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [jobResp, pmResp] = await Promise.all([
        fetch("/api/app/contractor/appointment", { cache: "no-store", credentials: "include" }),
        fetch(`/api/app/job/${encodeURIComponent(jobId)}/pm`, { cache: "no-store", credentials: "include" }),
      ]);
      const jobJson = (await jobResp.json().catch(() => ({}))) as ContractorAppointmentResponse;
      const pmJson = (await pmResp.json().catch(() => ({}))) as PMListResponse;
      if (!jobResp.ok) throw new Error(parseError(jobJson, "Failed to load job"));
      if (!pmResp.ok) throw new Error(parseError(pmJson, "Failed to load P&M requests"));
      const activeJob = jobJson?.active?.job;
      if (activeJob && String(activeJob.id) === jobId) {
        setJobStatus(String(activeJob.status ?? ""));
        setJobTitle(String(activeJob.title ?? ""));
      } else {
        setJobStatus("");
      }
      setRequests(Array.isArray(pmJson?.requests) ? pmJson.requests : []);
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

  const currentAutoTotal = useMemo(() => {
    const existingItemsTotal = (openDraft?.lineItems ?? []).reduce((sum, item) => sum + decimal(item.lineTotal), 0);
    const pendingLineTotal = decimal(draftLine.unitPrice) * Number(draftLine.quantity || 0);
    return existingItemsTotal + pendingLineTotal + decimal(taxAmount);
  }, [openDraft?.lineItems, draftLine.quantity, draftLine.unitPrice, taxAmount]);

  async function callAction(action: string, body: Record<string, unknown>) {
    const resp = await fetch(`/api/app/job/${encodeURIComponent(jobId)}/pm/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(parseError(json, `Failed to ${action}`));
    return json;
  }

  async function initiate() {
    setLoadingAction(true);
    setError("");
    try {
      await callAction("initiate", {});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to initiate");
    } finally {
      setLoadingAction(false);
    }
  }

  async function addLineItem() {
    if (!openDraft) return;
    if (!draftLine.description.trim()) {
      setError("Description is required.");
      return;
    }
    const qty = Math.max(1, Number(draftLine.quantity || 1));
    const unitPrice = decimal(draftLine.unitPrice);
    setLoadingAction(true);
    setError("");
    try {
      await callAction("add-line-item", {
        pmRequestId: openDraft.id,
        description: draftLine.description.trim(),
        quantity: qty,
        unitPrice,
        url: draftLine.url.trim() || undefined,
      });
      setDraftLine({ description: "", quantity: 1, unitPrice: "", url: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add item");
    } finally {
      setLoadingAction(false);
    }
  }

  async function submitDraft() {
    if (!openDraft) return;
    const manual = manualTotal.trim() ? decimal(manualTotal) : undefined;
    if (manual != null && manual > currentAutoTotal) {
      setError("Manual total cannot exceed auto total.");
      return;
    }
    setLoadingAction(true);
    setError("");
    try {
      await callAction("submit", {
        pmRequestId: openDraft.id,
        manualTotal: manual,
      });
      setManualTotal("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setLoadingAction(false);
    }
  }

  async function uploadReceipt(requestId: string, files: FileList | null) {
    if (!files?.length) return;
    setLoadingAction(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        const fileBase64 = await fileToBase64(file);
        await callAction("upload-receipt", {
          pmRequestId: requestId,
          fileBase64,
        });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload receipt");
    } finally {
      setLoadingAction(false);
    }
  }

  const isInactive = String(jobStatus).toUpperCase() !== "IN_PROGRESS";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 p-6">
        <div className="text-sm font-semibold uppercase tracking-wide text-gray-500">CardHeader</div>
        <h2 className="mt-1 text-xl font-bold text-gray-900">Parts &amp; Materials</h2>
        <div className="mt-4 space-y-4">
          {loading ? <div className="text-gray-600">Loading…</div> : null}
          {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

          {!loading && isInactive ? (
            <div className="space-y-3 text-gray-700">
              <p>The Parts and Materials section will become active and optional during a job in progress.</p>
              <p>
                During an active job, this feature allows the Contractor to request reimbursement for materials purchased
                on behalf of the Job Poster. All payouts require receipt uploads and approval.
              </p>
            </div>
          ) : null}

          {!loading && !isInactive ? (
            <div className="space-y-4">
              {jobTitle ? <div className="text-sm text-gray-600">Job: <span className="font-semibold text-gray-900">{jobTitle}</span></div> : null}
              {!openDraft ? (
                <button
                  type="button"
                  disabled={loadingAction}
                  onClick={() => void initiate()}
                  className="rounded-lg bg-8fold-green px-4 py-2 font-semibold text-white hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500"
                >
                  {loadingAction ? "Working…" : "Initiate P&M Request"}
                </button>
              ) : null}

              {openDraft ? (
                <div className="rounded-xl border border-gray-200 p-4">
                  <div className="font-semibold text-gray-900">Draft Line Item Builder</div>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <input
                      value={draftLine.description}
                      onChange={(e) => setDraftLine((s) => ({ ...s, description: e.target.value }))}
                      placeholder="Description"
                      className="rounded-lg border border-gray-300 px-3 py-2"
                    />
                    <input
                      type="number"
                      min={1}
                      value={draftLine.quantity}
                      onChange={(e) => setDraftLine((s) => ({ ...s, quantity: Number(e.target.value || 1) }))}
                      placeholder="Qty"
                      className="rounded-lg border border-gray-300 px-3 py-2"
                    />
                    <input
                      value={draftLine.url}
                      onChange={(e) => setDraftLine((s) => ({ ...s, url: e.target.value }))}
                      placeholder="URL"
                      className="rounded-lg border border-gray-300 px-3 py-2"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={draftLine.unitPrice}
                      onChange={(e) => setDraftLine((s) => ({ ...s, unitPrice: e.target.value }))}
                      placeholder="Unit Price"
                      className="rounded-lg border border-gray-300 px-3 py-2"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={taxAmount}
                      onChange={(e) => setTaxAmount(e.target.value)}
                      placeholder="Tax Amount"
                      className="rounded-lg border border-gray-300 px-3 py-2"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={manualTotal}
                      onChange={(e) => setManualTotal(e.target.value)}
                      placeholder="Manual Total Override"
                      className="rounded-lg border border-gray-300 px-3 py-2"
                    />
                  </div>
                  <div className="mt-3 text-sm text-gray-700">Auto Total: <span className="font-semibold">{formatMoney(currentAutoTotal, openDraft.currency)}</span></div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={loadingAction}
                      onClick={() => void addLineItem()}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    >
                      Add Item
                    </button>
                    <button
                      type="button"
                      disabled={loadingAction}
                      onClick={() => void submitDraft()}
                      className="rounded-lg bg-8fold-green px-3 py-2 text-sm font-semibold text-white hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500"
                    >
                      Submit
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="space-y-3">
                {requests.map((req) => {
                  const amount = decimal(req.approvedTotal ?? req.manualTotal ?? req.autoTotal);
                  const isOpen = Boolean(expanded[req.id]);
                  return (
                    <div key={req.id} className="rounded-xl border border-gray-200">
                      <button
                        type="button"
                        onClick={() => setExpanded((s) => ({ ...s, [req.id]: !isOpen }))}
                        className="flex w-full items-center justify-between gap-3 p-4 text-left"
                      >
                        <div>
                          <div className="font-semibold text-gray-900">Request {req.id.slice(0, 8)}</div>
                          <div className="mt-1 text-sm text-gray-600">Total: {formatMoney(amount, req.currency)}</div>
                        </div>
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${pmBadgeClassByStatus[req.status]}`}>
                          {req.status}
                        </span>
                      </button>

                      {isOpen ? (
                        <div className="border-t border-gray-100 p-4">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-gray-500">
                                  <th className="py-1">Description</th>
                                  <th className="py-1">Qty</th>
                                  <th className="py-1">Unit Price</th>
                                  <th className="py-1">Line Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {req.lineItems.map((item) => (
                                  <tr key={item.id} className="border-t border-gray-100">
                                    <td className="py-2">{item.description}</td>
                                    <td className="py-2">{item.quantity}</td>
                                    <td className="py-2">{formatMoney(decimal(item.unitPrice), req.currency)}</td>
                                    <td className="py-2">{formatMoney(decimal(item.lineTotal), req.currency)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="mt-3 text-sm text-gray-700">
                            Receipts: {req.receipts.length} · Verified: {req.receipts.filter((r) => r.verified).length}
                          </div>

                          {req.status === "FUNDED" || req.status === "PAYMENT_PENDING" ? (
                            <div className="mt-4">
                              <label className="text-sm font-semibold text-gray-700">Upload Receipt</label>
                              <input
                                type="file"
                                className="mt-2 block"
                                disabled={loadingAction}
                                onChange={(e) => void uploadReceipt(req.id, e.target.files)}
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {!requests.length ? <div className="text-sm text-gray-600">No P&amp;M requests yet.</div> : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

