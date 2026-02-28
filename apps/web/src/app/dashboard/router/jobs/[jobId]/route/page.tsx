"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import React from "react";
import { AccountIncompleteModal } from "@/components/modals/AccountIncompleteModal";
import { parseMissingSteps, type MissingStep } from "@/lib/accountIncomplete";

type EligibleContractor = {
  contractorId: string;
  businessName: string;
  contactName: string;
  tradeCategory: string;
  yearsExperience: number;
  city: string;
  stripeVerified: boolean;
  distanceKm: number;
};

type EligibleResponse = {
  kind?: "ok";
  job?: {
    id: string;
    title: string;
    city: string;
    region: string;
    tradeCategory: string;
    urbanOrRegional: string;
    appraisalTotal: number;
    createdAt: string;
    radiusKm: number;
  };
  contractors?: EligibleContractor[];
};

function formatMoney(cents: number) {
  return `$${(Math.max(0, Number(cents) || 0) / 100).toFixed(2)}`;
}

export default function RouterRouteJobPage() {
  const params = useParams<{ jobId: string }>();
  const router = useRouter();
  const jobId = String(params?.jobId ?? "");

  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [job, setJob] = React.useState<EligibleResponse["job"] | null>(null);
  const [contractors, setContractors] = React.useState<EligibleContractor[]>([]);
  const [selectedContractorIds, setSelectedContractorIds] = React.useState<string[]>([]);
  const [showIncompleteModal, setShowIncompleteModal] = React.useState(false);
  const [missingSteps, setMissingSteps] = React.useState<MissingStep[]>([]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      if (!jobId) {
        setError("Invalid job ID");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const resp = await fetch(`/api/v4/router/jobs/${encodeURIComponent(jobId)}/eligible-contractors`, {
          cache: "no-store",
          credentials: "include",
        });
        const data = (await resp.json().catch(() => null)) as EligibleResponse & { error?: { message?: string } | string };
        if (!alive) return;
        if (!resp.ok || data?.kind !== "ok") {
          const msg = typeof data?.error === "string" ? data.error : data?.error?.message ?? "Failed to load contractors";
          setError(msg);
          return;
        }
        setJob(data.job ?? null);
        setContractors(Array.isArray(data.contractors) ? data.contractors : []);
      } catch {
        if (alive) setError("Failed to load contractors");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [jobId]);

  function toggleContractor(contractorId: string) {
    setSelectedContractorIds((prev) => {
      if (prev.includes(contractorId)) return prev.filter((id) => id !== contractorId);
      if (prev.length >= 5) return prev;
      return [...prev, contractorId];
    });
  }

  async function routeJob() {
    if (!jobId || selectedContractorIds.length < 1 || selectedContractorIds.length > 5) return;
    setSubmitting(true);
    setError("");
    try {
      const resp = await fetch(`/api/v4/router/jobs/${encodeURIComponent(jobId)}/route`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ contractorIds: selectedContractorIds }),
      });
      const data = (await resp.json().catch(() => ({}))) as any;
      const missing = parseMissingSteps(data);
      if (missing) {
        setMissingSteps(missing);
        setShowIncompleteModal(true);
        return;
      }
      if (!resp.ok) {
        const msg = typeof data?.error === "string" ? data.error : data?.error?.message ?? "Failed to route job";
        setError(msg);
        return;
      }
      router.push("/dashboard/router/jobs/routed");
    } catch {
      setError("Failed to route job");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (error) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-red-700">{error}</p>
        <Link href="/dashboard/router/jobs/available" className="text-sm font-medium text-emerald-700 hover:text-emerald-800">
          Back to Available Jobs
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Route Job: {job?.title ?? "Job"}</h1>
        <p className="mt-1 text-sm text-slate-600">Select up to 5 contractors.</p>
        <div className="mt-2 text-sm text-slate-600">
          {job?.city ? `${job.city}, ` : ""}
          {job?.region ?? ""} • {job?.urbanOrRegional ?? "Urban"} • Appraisal Total {formatMoney(job?.appraisalTotal ?? 0)}
        </div>
      </div>

      {contractors.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
          No eligible contractors available for this job.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {contractors.map((contractor) => {
            const selected = selectedContractorIds.includes(contractor.contractorId);
            const disableUnchecked = !selected && selectedContractorIds.length >= 5;
            return (
              <li key={contractor.contractorId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={disableUnchecked || submitting}
                    onChange={() => toggleContractor(contractor.contractorId)}
                    className="mt-1 h-4 w-4"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-lg font-semibold text-slate-900">{contractor.businessName}</div>
                    <div className="text-sm text-slate-600">{contractor.contactName}</div>
                    <div className="mt-2 text-sm text-slate-600">
                      {contractor.tradeCategory} • {contractor.yearsExperience} years experience
                    </div>
                    <div className="text-sm text-slate-600">
                      {contractor.city || "Unknown city"} • {contractor.distanceKm.toFixed(1)} km away
                    </div>
                    <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      {contractor.stripeVerified ? "Stripe Verified" : "Stripe Unverified"}
                    </span>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard/router/jobs/available" className="text-sm font-medium text-slate-600 hover:text-slate-800">
          Back
        </Link>
        <button
          type="button"
          onClick={routeJob}
          disabled={submitting || selectedContractorIds.length < 1 || selectedContractorIds.length > 5}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Route Job to Selected Contractors
        </button>
      </div>

      <AccountIncompleteModal
        role="ROUTER"
        missing={missingSteps}
        open={showIncompleteModal}
        onClose={() => setShowIncompleteModal(false)}
      />
    </div>
  );
}
