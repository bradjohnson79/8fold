"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";

type AdjustmentData = {
  id: string;
  jobId: string;
  jobTitle: string;
  jobDescription: string;
  // Snapshot of the original job price at request creation time.
  originalPriceCents: number | null;
  requestedPriceCents: number;
  // Computed by the API as requestedPriceCents - originalPriceCents.
  differenceCents: number;
  contractorScopeDetails: string;
  additionalScopeDetails: string;
  status: string;
};

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function getApiOrigin() {
  const explicit = String(process.env.NEXT_PUBLIC_API_ORIGIN ?? "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return "http://localhost:3003";
  }
  return "https://api.8fold.app";
}

export default function JobAdjustmentPage() {
  const params = useParams<{ adjustmentId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const adjustmentId = params.adjustmentId;
  const token = searchParams.get("token") ?? "";

  const [adjustment, setAdjustment] = useState<AdjustmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [declined, setDeclined] = useState(false);

  const apiOrigin = useMemo(() => getApiOrigin(), []);

  const loadAdjustment = useCallback(async () => {
    setLoading(true);
    setError("");
    setExpired(false);
    try {
      const resp = await fetch(
        `${apiOrigin}/api/web/v4/job-adjustment/${encodeURIComponent(adjustmentId)}?token=${encodeURIComponent(token)}`,
        { credentials: "include" },
      );
      const json = await resp.json().catch(() => ({} as any));
      if (resp.status === 403) {
        const msg = String(json?.error ?? "");
        if (msg.toLowerCase().includes("expired")) {
          setExpired(true);
          return;
        }
      }
      if (!resp.ok) throw new Error(json?.error ?? "Failed to load adjustment details");
      setAdjustment(json.adjustment as AdjustmentData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load this page.");
    } finally {
      setLoading(false);
    }
  }, [apiOrigin, adjustmentId, token]);

  useEffect(() => {
    void loadAdjustment();
  }, [loadAdjustment]);

  async function handleDecline() {
    if (!window.confirm("Are you sure you want to decline this re-appraisal request?")) return;
    setDeclining(true);
    setError("");
    try {
      const resp = await fetch(
        `${apiOrigin}/api/web/v4/job-adjustment/${encodeURIComponent(adjustmentId)}/decline`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token }),
        },
      );
      const json = await resp.json().catch(() => ({} as any));
      if (!resp.ok) throw new Error(json?.error ?? "Failed to decline");
      setDeclined(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to decline");
    } finally {
      setDeclining(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-600">Loading...</p>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Link Expired</h1>
          <p className="mt-2 text-sm text-slate-600">
            This consent link has expired. Please contact your contractor to request a new link.
          </p>
        </div>
      </div>
    );
  }

  if (error && !adjustment) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow text-center">
          <h1 className="text-lg font-semibold text-rose-700">Unable to Load</h1>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  if (declined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow text-center">
          <h1 className="text-lg font-semibold text-slate-900">Revision Declined</h1>
          <p className="mt-2 text-sm text-slate-600">
            You have declined the contractor&apos;s re-appraisal request. The job will proceed under the original agreed price.
          </p>
        </div>
      </div>
    );
  }

  if (!adjustment) return null;

  const originalCents = adjustment.originalPriceCents ?? 0;
  const differenceCents = adjustment.differenceCents;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow">
        <h1 className="text-xl font-bold text-slate-900">Job Price Revision Request</h1>
        <p className="mt-1 text-sm text-slate-600">
          Your contractor has requested a price revision for the following job.
        </p>

        <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm space-y-2">
          <p><span className="font-semibold">Job:</span> {adjustment.jobTitle}</p>
          {adjustment.jobDescription && (
            <p><span className="font-semibold">Description:</span> {adjustment.jobDescription}</p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-slate-100 p-3">
            <p className="text-xs text-slate-500">Original Price</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{formatMoney(originalCents)}</p>
          </div>
          <div className="rounded-lg bg-emerald-50 p-3">
            <p className="text-xs text-emerald-600">Requested Price</p>
            <p className="mt-1 text-lg font-bold text-emerald-700">{formatMoney(adjustment.requestedPriceCents)}</p>
          </div>
          <div className="rounded-lg bg-amber-50 p-3">
            <p className="text-xs text-amber-600">Additional Payment</p>
            <p className="mt-1 text-lg font-bold text-amber-700">{formatMoney(differenceCents)}</p>
          </div>
        </div>

        <div className="mt-4 space-y-3 text-sm text-slate-700">
          <div>
            <p className="font-semibold">Work included at current price:</p>
            <p className="mt-1 whitespace-pre-wrap text-slate-600">{adjustment.contractorScopeDetails}</p>
          </div>
          <div>
            <p className="font-semibold">Additional work required:</p>
            <p className="mt-1 whitespace-pre-wrap text-slate-600">{adjustment.additionalScopeDetails}</p>
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => void handleDecline()}
            disabled={declining}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {declining ? "Declining..." : "Decline Revision"}
          </button>
          <button
            type="button"
            onClick={() =>
              router.push(
                `/job-adjustment/${adjustmentId}/payment?token=${encodeURIComponent(token)}`,
              )
            }
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Accept Revision
          </button>
        </div>
      </div>
    </div>
  );
}
