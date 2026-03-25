"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { apiFetch } from "@/lib/routerApi";

type PaymentStatus = {
  connected: boolean;
  stripeStatus: "CONNECTED" | "NOT_CONNECTED";
  lastFour?: string;
  stripeUpdatedAt?: string | null;
  simulationEnabled?: boolean;
};

type PaymentBreakdown = {
  ok: true;
  jobId: string;
  currency: "USD" | "CAD";
  baseCents: number;
  contractorShareCents: number;
  routerShareCents: number;
  platformShareCents: number;
  stripeFeeCents: number;
  taxCents: number;
  totalCents: number;
};

function formatMoney(cents: number) {
  return `$${(Math.max(0, Number(cents) || 0) / 100).toFixed(2)}`;
}

export default function JobPosterPaymentPage() {
  const { getToken } = useAuth();
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [success, setSuccess] = useState(false);
  const [canceled, setCanceled] = useState(false);
  const [breakdown, setBreakdown] = useState<PaymentBreakdown | null>(null);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    setSuccess(params.get("success") === "1");
    setCanceled(params.get("canceled") === "1");
  }, []);

  const fetchStatus = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiFetch("/api/web/v4/job-poster/payment/status", getToken);
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? `Status failed: ${resp.status}`);
      }
      const data = await resp.json();
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payment status");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setBreakdownError(null);
        const jobsResp = await apiFetch("/api/web/v4/job-poster/jobs", getToken);
        const jobsJson = (await jobsResp.json().catch(() => ({}))) as { jobs?: Array<{ id: string }> };
        const firstJobId = Array.isArray(jobsJson.jobs) ? String(jobsJson.jobs[0]?.id ?? "") : "";
        if (!alive || !firstJobId) {
          setBreakdown(null);
          return;
        }

        const confirmResp = await apiFetch("/api/web/v4/job-poster/payment/confirm", getToken, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jobId: firstJobId }),
        });
        const confirmJson = (await confirmResp.json().catch(() => ({}))) as PaymentBreakdown & { error?: { message?: string } | string };
        if (!alive) return;
        if (!confirmResp.ok) {
          const message =
            typeof confirmJson.error === "string" ? confirmJson.error : confirmJson.error?.message ?? "Failed to load payment breakdown";
          setBreakdownError(message);
          setBreakdown(null);
          return;
        }
        setBreakdown(confirmJson);
      } catch {
        if (alive) {
          setBreakdownError("Failed to load payment breakdown");
          setBreakdown(null);
        }
      }
    })();
    return () => { alive = false; };
  }, [success, getToken]);

  const handleConnect = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const resp = await apiFetch("/api/web/v4/job-poster/payment/create-setup-session", getToken, { method: "POST" });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? "Failed to create setup session");
      }
      const { url } = await resp.json();
      if (url) window.location.href = url;
      else throw new Error("No redirect URL returned");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect payment method");
      setActionLoading(false);
    }
  };

  const handleSimulateSuccess = async () => {
    setSimulating(true);
    setError(null);
    try {
      const resp = await apiFetch("/api/web/v4/job-poster/payment/simulate-success", getToken, { method: "POST" });
      const data = await resp.json().catch(() => ({})) as { ok?: boolean; error?: string | { message?: string } };
      if (!resp.ok) {
        const message = typeof data.error === "string" ? data.error : data.error?.message;
        throw new Error(message ?? "Failed to simulate payment setup success");
      }
      if (data?.ok === false && data?.error === "STRIPE_NOT_CONFIGURED") {
        setError("Stripe is not configured in this environment.");
        return;
      }
      setSuccess(true);
      setCanceled(false);
      await fetchStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to simulate payment setup success");
    } finally {
      setSimulating(false);
    }
  };

  if (loading && !status) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-slate-900">Payment Setup</h1>
        <p className="mt-2 text-sm text-slate-600">Loading...</p>
      </div>
    );
  }

  const lastUpdated = status?.stripeUpdatedAt
    ? new Date(status.stripeUpdatedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : null;

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Payment Method &amp; Billing</h1>
        <p className="mt-1 text-sm text-slate-600">Add or update your payment method for job activation.</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}
      {success ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">Payment method connected successfully.</div>
      ) : null}
      {canceled ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">Setup was canceled. You can try again when ready.</div>
      ) : null}

      <div className="max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {status?.connected ? (
          <>
            <p className="font-medium text-slate-900">Status: Connected</p>
            {status.lastFour ? <p className="mt-1 text-sm text-slate-600">Card: &bull;&bull;&bull;&bull; {status.lastFour}</p> : null}
            {lastUpdated ? <p className="mt-1 text-sm text-slate-600">Last Updated: {lastUpdated}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={handleConnect} disabled={actionLoading} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {actionLoading ? "Redirecting..." : "Update Payment Method"}
              </button>
              {status?.simulationEnabled ? (
                <button type="button" onClick={handleSimulateSuccess} disabled={simulating || actionLoading} className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  {simulating ? "Simulating..." : "Stripe Simulation Success"}
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <p className="font-medium text-slate-900">Status: Not Connected</p>
            <p className="mt-1 text-sm text-slate-600">Add a payment method to activate jobs.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={handleConnect} disabled={actionLoading} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {actionLoading ? "Redirecting..." : "Connect Payment Method"}
              </button>
              {status?.simulationEnabled ? (
                <button type="button" onClick={handleSimulateSuccess} disabled={simulating || actionLoading} className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  {simulating ? "Simulating..." : "Stripe Simulation Success"}
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>

      <p className="text-sm text-slate-500">
        Payment is required before activating a job.{" "}
        <Link href="/post-job" className="font-medium text-emerald-700 hover:underline">Post a Job</Link>
      </p>

      <div className="max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Server Payment Breakdown</h2>
        {breakdownError ? <p className="mt-2 text-sm text-red-700">{breakdownError}</p> : null}
        {!breakdown && !breakdownError ? (
          <p className="mt-2 text-sm text-slate-600">No jobs available to calculate payment breakdown.</p>
        ) : null}
        {breakdown ? (
          <div className="mt-3 space-y-1 text-sm text-slate-700">
            <p><span className="font-medium">Base:</span> {formatMoney(breakdown.baseCents)}</p>
            <p><span className="font-medium">Contractor (80%):</span> {formatMoney(breakdown.contractorShareCents)}</p>
            <p><span className="font-medium">Router (8%):</span> {formatMoney(breakdown.routerShareCents)}</p>
            <p><span className="font-medium">Platform (12%):</span> {formatMoney(breakdown.platformShareCents)}</p>
            <p><span className="font-medium">Stripe Fee:</span> {formatMoney(breakdown.stripeFeeCents)}</p>
            <p><span className="font-medium">Tax:</span> {formatMoney(breakdown.taxCents)}</p>
            <p className="pt-1 font-semibold text-slate-900"><span className="font-medium">Total:</span> {formatMoney(breakdown.totalCents)}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
