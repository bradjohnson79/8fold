"use client";

import type { PMStatus } from "@8fold/shared";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
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
  stripePaymentIntentId: string | null;
  proposedBudget: string | null;
  amendReason: string | null;
  currency: string;
  lineItems: PMLineItem[];
  receipts: PMReceipt[];
  updatedAt: string;
};

type PMListResponse = { requests: PMRequest[]; error?: string; traceId?: string };
type JobStatusResponse = { jobs?: Array<{ id: string; title?: string; status?: string | null }> };
type PaymentIntentResponse = { clientSecret: string; paymentIntentId: string; traceId?: string; error?: string };

function decimal(v: string | number | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function parseError(json: any, fallback: string): string {
  const msg = String(json?.error ?? fallback);
  const trace = json?.traceId ? ` (traceId: ${String(json.traceId)})` : "";
  return `${msg}${trace}`;
}

function PaymentConfirmCard(props: {
  requestId: string;
  clientSecret: string;
  paymentIntentId: string;
  amountLabel: string;
  onDone: () => Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  return (
    <div className="mt-6 border border-gray-200 rounded-2xl p-6">
      <div className="font-bold text-gray-900">Approve & Pay</div>
      <div className="text-gray-600 mt-1">
        Funds are held in escrow and released only upon receipt verification.
      </div>
      <div className="text-sm text-gray-700 mt-3">
        Escrow amount: <span className="font-semibold text-gray-900">{props.amountLabel}</span>
      </div>

      {err ? (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{err}</div>
      ) : null}

      <div className="mt-5">
        <PaymentElement />
      </div>

      <button
        disabled={!stripe || !elements || submitting}
        onClick={() => {
          void (async () => {
            setSubmitting(true);
            setErr("");
            try {
              const res = await stripe!.confirmPayment({
                elements: elements!,
                redirect: "if_required",
                confirmParams: {
                  return_url: `${window.location.origin}/app/job-poster/payment/return-v2`,
                },
              });
              if (res.error) throw new Error(res.error.message || "Payment failed");
              await props.onDone();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Payment failed");
            } finally {
              setSubmitting(false);
            }
          })();
        }}
        className="mt-5 bg-8fold-green hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500 text-white font-semibold px-5 py-2.5 rounded-lg"
      >
        {submitting ? "Processing…" : "Pay & fund escrow"}
      </button>
    </div>
  );
}

export default function JobPosterMaterialsPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = String(params?.jobId ?? "");

  const stripePromise = useState(() => {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    return pk ? loadStripe(pk) : null;
  })[0];

  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);
  const [error, setError] = useState("");
  const [requests, setRequests] = useState<PMRequest[]>([]);
  const [jobStatus, setJobStatus] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [amendReason, setAmendReason] = useState("");
  const [proposedBudget, setProposedBudget] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [jobsResp, pmResp] = await Promise.all([
        fetch("/api/app/job-poster/jobs", { cache: "no-store", credentials: "include" }),
        fetch(`/api/app/job/${encodeURIComponent(jobId)}/pm`, { cache: "no-store", credentials: "include" }),
      ]);
      const jobsJson = (await jobsResp.json().catch(() => ({}))) as JobStatusResponse;
      const pmJson = (await pmResp.json().catch(() => ({}))) as PMListResponse;
      if (!jobsResp.ok) throw new Error(parseError(jobsJson, "Failed to load job"));
      if (!pmResp.ok) throw new Error(parseError(pmJson, "Failed to load P&M requests"));
      const job = (jobsJson.jobs ?? []).find((j) => String(j.id) === jobId);
      setJobStatus(String(job?.status ?? ""));
      setJobTitle(String(job?.title ?? ""));
      setRequests(Array.isArray(pmJson.requests) ? pmJson.requests : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [jobId]);

  const activeRequest = useMemo(() => requests[0] ?? null, [requests]);
  const isInactive = String(jobStatus).toUpperCase() !== "IN_PROGRESS";

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

  async function initiateFromPoster() {
    setLoadingAction(true);
    setError("");
    try {
      await callAction("initiate", { initiatedBy: "POSTER" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to initiate");
    } finally {
      setLoadingAction(false);
    }
  }

  async function approve() {
    if (!activeRequest) return;
    setLoadingAction(true);
    setError("");
    try {
      await callAction("approve", { pmRequestId: activeRequest.id });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to approve");
    } finally {
      setLoadingAction(false);
    }
  }

  async function amend() {
    if (!activeRequest) return;
    setLoadingAction(true);
    setError("");
    try {
      await callAction("amend", {
        pmRequestId: activeRequest.id,
        amendReason: amendReason.trim() || "Need amendment",
        proposedBudget: decimal(proposedBudget || activeRequest.autoTotal),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to request amendment");
    } finally {
      setLoadingAction(false);
    }
  }

  async function reject() {
    if (!activeRequest) return;
    setLoadingAction(true);
    setError("");
    try {
      await callAction("reject", { pmRequestId: activeRequest.id });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reject");
    } finally {
      setLoadingAction(false);
    }
  }

  async function createPaymentIntent() {
    if (!activeRequest) return;
    setLoadingAction(true);
    setError("");
    try {
      const resp = await fetch(`/api/app/job/${encodeURIComponent(jobId)}/pm/create-payment-intent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pmRequestId: activeRequest.id }),
      });
      const json = (await resp.json().catch(() => ({}))) as PaymentIntentResponse;
      if (!resp.ok) throw new Error(parseError(json, "Failed to create payment intent"));
      setClientSecret(json.clientSecret);
      setPaymentIntentId(json.paymentIntentId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create payment intent");
    } finally {
      setLoadingAction(false);
    }
  }

  async function verifyReceipts() {
    if (!activeRequest) return;
    setLoadingAction(true);
    setError("");
    try {
      await callAction("verify-receipts", { pmRequestId: activeRequest.id });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to verify receipts");
    } finally {
      setLoadingAction(false);
    }
  }

  async function releaseFunds() {
    if (!activeRequest) return;
    setLoadingAction(true);
    setError("");
    try {
      await callAction("release-funds", { pmRequestId: activeRequest.id });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to release funds");
    } finally {
      setLoadingAction(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 p-6">
        <div className="text-sm font-semibold uppercase tracking-wide text-gray-500">CardHeader</div>
        <h2 className="mt-1 text-xl font-bold text-gray-900">Parts &amp; Materials</h2>
        <div className="mt-4 space-y-4">
          {loading ? <div className="text-gray-600">Loading…</div> : null}
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

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
              {!activeRequest ? (
                <button
                  type="button"
                  disabled={loadingAction}
                  onClick={() => void initiateFromPoster()}
                  className="rounded-lg bg-8fold-green px-4 py-2 font-semibold text-white hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500"
                >
                  {loadingAction ? "Working…" : "Request P&M Quote from Contractor"}
                </button>
              ) : null}

              <div className="space-y-3">
                {requests.map((req) => {
                  const isOpen = Boolean(expanded[req.id]);
                  const total = decimal(req.approvedTotal ?? req.manualTotal ?? req.autoTotal);
                  return (
                    <div key={req.id} className="rounded-xl border border-gray-200">
                      <button
                        type="button"
                        onClick={() => setExpanded((s) => ({ ...s, [req.id]: !isOpen }))}
                        className="flex w-full items-center justify-between gap-3 p-4 text-left"
                      >
                        <div>
                          <div className="font-semibold text-gray-900">Request {req.id.slice(0, 8)}</div>
                          <div className="mt-1 text-sm text-gray-600">Total: {formatMoney(total, req.currency)}</div>
                        </div>
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${pmBadgeClassByStatus[req.status]}`}>
                          {req.status}
                        </span>
                      </button>

                      {isOpen ? (
                        <div className="border-t border-gray-100 p-4 space-y-4">
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

                          <div className="text-sm text-gray-700">
                            Receipts: {req.receipts.length} · Verified: {req.receipts.filter((r) => r.verified).length}
                          </div>

                          {req.status === "SUBMITTED" ? (
                            <div className="space-y-3">
                              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <input
                                  value={amendReason}
                                  onChange={(e) => setAmendReason(e.target.value)}
                                  placeholder="Amendment reason"
                                  className="rounded-lg border border-gray-300 px-3 py-2"
                                />
                                <input
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  value={proposedBudget}
                                  onChange={(e) => setProposedBudget(e.target.value)}
                                  placeholder="Proposed budget"
                                  className="rounded-lg border border-gray-300 px-3 py-2"
                                />
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={loadingAction}
                                  onClick={() => void approve()}
                                  className="rounded-lg bg-8fold-green px-3 py-2 text-sm font-semibold text-white hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={loadingAction}
                                  onClick={() => void amend()}
                                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                                >
                                  Request Amendment
                                </button>
                                <button
                                  type="button"
                                  disabled={loadingAction}
                                  onClick={() => void reject()}
                                  className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                                >
                                  Reject
                                </button>
                              </div>
                            </div>
                          ) : null}

                          {req.status === "APPROVED" ? (
                            <div className="space-y-3">
                              <button
                                type="button"
                                disabled={loadingAction || Boolean(req.stripePaymentIntentId)}
                                onClick={() => void createPaymentIntent()}
                                className="rounded-lg bg-8fold-green px-3 py-2 text-sm font-semibold text-white hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500"
                              >
                                {req.stripePaymentIntentId ? "PaymentIntent Already Created" : loadingAction ? "Working…" : "Pay P&M Quote"}
                              </button>
                              {clientSecret && paymentIntentId && stripePromise ? (
                                <Elements stripe={stripePromise} options={{ clientSecret }}>
                                  <PaymentConfirmCard
                                    requestId={req.id}
                                    clientSecret={clientSecret}
                                    paymentIntentId={paymentIntentId}
                                    amountLabel={formatMoney(total, req.currency)}
                                    onDone={async () => {
                                      setClientSecret(null);
                                      setPaymentIntentId(null);
                                      await load();
                                    }}
                                  />
                                </Elements>
                              ) : null}
                            </div>
                          ) : null}

                          {req.status === "RECEIPTS_SUBMITTED" ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={loadingAction}
                                onClick={() => void verifyReceipts()}
                                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                              >
                                Verify Receipts
                              </button>
                            </div>
                          ) : null}

                          {req.status === "VERIFIED" ? (
                            <button
                              type="button"
                              disabled={loadingAction}
                              onClick={() => void releaseFunds()}
                              className="rounded-lg bg-8fold-green px-3 py-2 text-sm font-semibold text-white hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500"
                            >
                              Release Funds
                            </button>
                          ) : null}

                          {(req.status === "RELEASED" || req.status === "CLOSED") ? (
                            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                              Released amount: {formatMoney(total, req.currency)}. Any remainder was handled as wallet credit or Stripe refund.
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

