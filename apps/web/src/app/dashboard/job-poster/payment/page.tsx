"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

type PaymentStatus = {
  connected: boolean;
  stripeStatus: "CONNECTED" | "NOT_CONNECTED";
  lastFour?: string;
  stripeUpdatedAt?: string | null;
  simulationEnabled?: boolean;
};

export default function JobPosterPaymentPage() {
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [success, setSuccess] = useState(false);
  const [canceled, setCanceled] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    setSuccess(params.get("success") === "1");
    setCanceled(params.get("canceled") === "1");
  }, []);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/web/v4/job-poster/payment/status", { cache: "no-store", credentials: "include" });
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
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleConnect = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/web/v4/job-poster/payment/create-setup-session", {
        method: "POST",
        credentials: "include",
      });
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

  const handleUpdate = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/web/v4/job-poster/payment/create-setup-session", {
        method: "POST",
        credentials: "include",
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? "Failed to create setup session");
      }
      const { url } = await resp.json();
      if (url) window.location.href = url;
      else throw new Error("No redirect URL returned");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update payment method");
      setActionLoading(false);
    }
  };

  const handleSimulateSuccess = async () => {
    setSimulating(true);
    setError(null);
    try {
      const resp = await fetch("/api/web/v4/job-poster/payment/simulate-success", {
        method: "POST",
        credentials: "include",
      });
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
        <h1 className="text-2xl font-bold">Payment Setup</h1>
        <p className="mt-2 text-gray-600">Loading…</p>
      </div>
    );
  }

  const lastUpdated = status?.stripeUpdatedAt
    ? new Date(status.stripeUpdatedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-2xl font-bold">Payment Method & Billing</h1>
      <p className="mt-1 text-gray-600">Add or update your payment method for job activation.</p>

      {error && (
        <div className="mt-4 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 p-4 rounded-lg bg-green-50 border border-green-200 text-green-800">
          Payment method connected successfully.
        </div>
      )}

      {canceled && (
        <div className="mt-4 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
          Setup was canceled. You can try again when ready.
        </div>
      )}

      <div className="mt-6 p-6 rounded-lg border border-gray-200 bg-white">
        {status?.connected ? (
          <>
            <p className="font-medium text-gray-900">Status: Connected</p>
            {status.lastFour && (
              <p className="mt-1 text-gray-600">Card: •••• {status.lastFour}</p>
            )}
            {lastUpdated && (
              <p className="mt-1 text-gray-600">Last Updated: {lastUpdated}</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleUpdate}
                disabled={actionLoading}
                className="px-4 py-2 rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? "Redirecting…" : "Update Payment Method"}
              </button>
              {status?.simulationEnabled ? (
                <button
                  type="button"
                  onClick={handleSimulateSuccess}
                  disabled={simulating || actionLoading}
                  className="px-4 py-2 rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {simulating ? "Simulating…" : "Stripe Simulation Success"}
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <p className="font-medium text-gray-900">Status: Not Connected</p>
            <p className="mt-1 text-gray-600">Add a payment method to activate jobs.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleConnect}
                disabled={actionLoading}
                className="px-4 py-2 rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? "Redirecting…" : "Connect Payment Method"}
              </button>
              {status?.simulationEnabled ? (
                <button
                  type="button"
                  onClick={handleSimulateSuccess}
                  disabled={simulating || actionLoading}
                  className="px-4 py-2 rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {simulating ? "Simulating…" : "Stripe Simulation Success"}
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>

      <p className="mt-4 text-sm text-gray-500">
        Payment is required before activating a job.{" "}
        <Link href="/post-job" className="text-blue-600 hover:underline">
          Post a Job
        </Link>
      </p>
    </div>
  );
}
