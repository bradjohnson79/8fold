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
  const [success, setSuccess] = useState(false);
  const [canceled, setCanceled] = useState(false);

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
  const showVerifiedSuccess = success && status?.connected === true;
  const showPendingReturn = success && status?.connected !== true && !loading;

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Payment Method &amp; Billing</h1>
        <p className="mt-1 text-sm text-slate-600">Add or update your payment method for job activation.</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}
      {showVerifiedSuccess ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">Payment method connected successfully.</div>
      ) : null}
      {showPendingReturn ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Returned from Stripe. If your payment method is still not connected, please refresh.
        </div>
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
            </div>
          </>
        )}
      </div>

      <p className="text-sm text-slate-500">
        Payment is required before activating a job.{" "}
        <Link href="/dashboard/job-poster/post-job" className="font-medium text-emerald-700 hover:underline">Post a Job</Link>
      </p>

      <div className="max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Billing Notes</h2>
        <p className="mt-2 text-sm text-slate-600">
          Job pricing, platform fees, taxes, and Stripe processing totals are confirmed during the job posting flow.
          This page only reflects your saved payment method status.
        </p>
      </div>
    </div>
  );
}
