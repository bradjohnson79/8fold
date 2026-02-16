"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { IncentiveBadge } from "../../../../../../../components/Progress";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

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
  };
  viewer: { isJobPoster: boolean };
  error?: string;
};

type PaymentIntentResponse = {
  clientSecret: string;
  paymentIntentId: string;
  totalCents?: number;
  amountCents?: number;
};

function money(cents: number, currency: string) {
  const amt = (cents / 100).toFixed(2);
  return currency === "CAD" ? `C$${amt}` : `$${amt}`;
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
                redirect: "if_required"
              });
              if (res.error) throw new Error(res.error.message || "Payment failed");

              const resp = await fetch(`/api/app/materials/${encodeURIComponent(props.requestId)}/confirm-payment`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ paymentIntentId: props.paymentIntentId })
              });
              const json = await resp.json().catch(() => ({}));
              if (!resp.ok) throw new Error(json?.error || "Failed to confirm payment");

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
  const jobId = params.jobId;

  const stripePromise = useState(() => {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    return pk ? loadStripe(pk) : null;
  })[0];

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<MaterialsResponse | null>(null);
  const [acting, setActing] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(`/api/app/materials/by-job?jobId=${encodeURIComponent(jobId)}`, {
        cache: "no-store"
      });
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
  }, [jobId]);

  async function approve() {
    if (!data?.request) return;
    setActing(true);
    setError("");
    try {
      const resp = await fetch(`/api/app/materials/${data.request.id}/create-payment-intent`, { method: "POST" });
      const json = (await resp.json().catch(() => ({}))) as PaymentIntentResponse;
      if (!resp.ok) throw new Error((json as any)?.error || "Failed to create payment intent");
      setClientSecret(json.clientSecret);
      setPaymentIntentId(json.paymentIntentId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setActing(false);
    }
  }

  async function decline() {
    if (!data?.request) return;
    setActing(true);
    setError("");
    try {
      const resp = await fetch(`/api/app/materials/${data.request.id}/decline`, { method: "POST" });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Failed to decline");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setActing(false);
    }
  }

  return (
    <>
      <h2 className="text-lg font-bold text-gray-900">Materials decision</h2>
      <p className="text-gray-600 mt-2">
        Review factual parts/materials only. No labor, markup, or estimates. Funds are held in escrow and released
        only upon receipt verification.
      </p>

      {error ? (
        <div className="mt-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6 text-gray-600">Loading…</div>
      ) : data?.request ? (
        <div className="mt-6 space-y-6">
          <div className="border border-gray-200 rounded-2xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-bold text-gray-900">
                  Status:{" "}
                  <span className="inline-flex px-2 py-1 rounded-full text-sm bg-gray-100 border border-gray-200">
                    {data.request.status}
                  </span>
                </div>
                <div className="text-gray-600 mt-1">
                  Total materials: <span className="font-semibold text-gray-900">{money(data.request.totalAmountCents, data.request.currency)}</span>
                </div>
              </div>
              <IncentiveBadge
                status={
                  data.request.status === "SUBMITTED"
                    ? "IN_PROGRESS"
                    : data.request.status === "APPROVED"
                      ? "COMPLETED_AWAITING_ADMIN"
                      : "LOCKED"
                }
              />
            </div>

            <div className="mt-4 divide-y divide-gray-100 border border-gray-100 rounded-xl">
              {data.request.items.map((it) => (
                <div key={it.id} className="p-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold text-gray-900">{it.name}</div>
                    <div className="text-xs text-gray-500 mt-1">Category: {it.category}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      Qty {it.quantity} · Unit {money(it.unitPriceCents, data.request!.currency)}
                    </div>
                    {it.priceUrl ? (
                      <a
                        className="text-sm text-8fold-green hover:text-8fold-green-dark mt-2 inline-block"
                        href={it.priceUrl}
                      >
                        Price link →
                      </a>
                    ) : null}
                  </div>
                  <div className="text-gray-700 font-semibold">
                    {money(it.quantity * it.unitPriceCents, data.request!.currency)}
                  </div>
                </div>
              ))}
            </div>

            {data.request.status === "SUBMITTED" ? (
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => void approve()}
                  disabled={acting}
                  className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-5 py-2.5 rounded-lg"
                >
                  {acting ? "Working…" : "Approve & Pay (Stripe)"}
                </button>
                <button
                  onClick={() => void decline()}
                  disabled={acting}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold px-5 py-2.5 rounded-lg"
                >
                  Decline
                </button>
              </div>
            ) : null}

            {data.request.status === "SUBMITTED" && clientSecret && paymentIntentId && stripePromise ? (
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <PaymentConfirmCard
                  requestId={data.request.id}
                  clientSecret={clientSecret}
                  paymentIntentId={paymentIntentId}
                  amountLabel={money(data.request.totalAmountCents, data.request.currency)}
                  onDone={async () => {
                    setClientSecret(null);
                    setPaymentIntentId(null);
                    await load();
                  }}
                />
              </Elements>
            ) : null}

            {data.request.status === "ESCROWED" && data.request.escrow ? (
              <div className="mt-6 bg-green-50 border border-green-200 rounded-2xl p-5">
                <div className="font-bold text-green-900">Escrow funded</div>
                <div className="text-green-800 mt-1">
                  Funds are held in materials escrow and will be released only upon receipt verification.
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-6 border border-gray-200 rounded-2xl p-6">
          <div className="font-bold text-gray-900">No materials request</div>
          <div className="text-gray-600 mt-1">There is no pending materials request for this job.</div>
        </div>
      )}
    </>
  );
}

