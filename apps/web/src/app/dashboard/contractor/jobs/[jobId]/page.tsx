"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AccountIncompleteModal } from "@/components/modals/AccountIncompleteModal";
import { parseMissingSteps, type MissingStep } from "@/lib/accountIncomplete";

type JobDetail = {
  job: {
    id: string;
    title?: string;
    scope?: string;
    region?: string;
    addressFull?: string;
    lat?: number;
    lng?: number;
  };
  assignment: { status: string; assignedAt: string };
};

export default function ContractorJobDetailPage() {
  const params = useParams();
  const jobId = String(params?.jobId ?? "");
  const [data, setData] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [availabilitySubmitting, setAvailabilitySubmitting] = useState(false);
  const [availabilityJson, setAvailabilityJson] = useState("");
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [progressAction, setProgressAction] = useState<"start" | "complete" | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [showIncompleteModal, setShowIncompleteModal] = useState(false);
  const [missingSteps, setMissingSteps] = useState<MissingStep[]>([]);

  const fetchJob = async () => {
    if (!jobId) return;
    try {
      const resp = await fetch(`/api/v4/contractor/jobs/${encodeURIComponent(jobId)}`, {
        cache: "no-store",
        credentials: "include",
      });
      if (resp.ok) {
        const d = (await resp.json()) as JobDetail;
        setData(d);
      } else {
        setData(null);
      }
    } catch {
      setData(null);
    }
  };

  useEffect(() => {
    if (!jobId) return;
    setLoading(true);
    fetchJob().finally(() => setLoading(false));
  }, [jobId]);

  async function handleStartJob() {
    setProgressError(null);
    setProgressAction("start");
    try {
      const resp = await fetch(`/api/v4/contractor/jobs/${encodeURIComponent(jobId)}/start`, {
        method: "POST",
        credentials: "include",
      });
      const result = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string | { message?: string; code?: string; details?: { missing?: MissingStep[] } };
      };
      if (resp.ok && result.ok) {
        await fetchJob();
      } else {
        const missing = parseMissingSteps(result);
        if (missing) {
          setMissingSteps(missing);
          setShowIncompleteModal(true);
          return;
        }
        const msg = typeof result?.error === "string" ? result.error : result?.error?.message;
        setProgressError(msg ?? "Failed to start job");
      }
    } catch {
      setProgressError("Failed to start job");
    } finally {
      setProgressAction(null);
    }
  }

  async function handleCompleteJob() {
    setProgressError(null);
    setProgressAction("complete");
    try {
      const resp = await fetch(`/api/v4/contractor/jobs/${encodeURIComponent(jobId)}/complete`, {
        method: "POST",
        credentials: "include",
      });
      const result = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string | { message?: string; code?: string; details?: { missing?: MissingStep[] } };
      };
      if (resp.ok && result.ok) {
        await fetchJob();
      } else {
        const missing = parseMissingSteps(result);
        if (missing) {
          setMissingSteps(missing);
          setShowIncompleteModal(true);
          return;
        }
        const msg = typeof result?.error === "string" ? result.error : result?.error?.message;
        setProgressError(msg ?? "Failed to complete job");
      }
    } catch {
      setProgressError("Failed to complete job");
    } finally {
      setProgressAction(null);
    }
  }

  async function handleSubmitAvailability(e: React.FormEvent) {
    e.preventDefault();
    setAvailabilityError(null);
    setAvailabilitySubmitting(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(availabilityJson || "{}");
      } catch {
        setAvailabilityError("Invalid JSON");
        return;
      }
      const resp = await fetch(`/api/v4/contractor/jobs/${encodeURIComponent(jobId)}/availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ availability: parsed }),
      });
      const result = (await resp.json().catch(() => ({}))) as { error?: string };
      if (resp.ok) {
        setAvailabilityJson("");
      } else {
        setAvailabilityError(result?.error ?? "Failed to submit");
      }
    } catch {
      setAvailabilityError("Failed to submit");
    } finally {
      setAvailabilitySubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-gray-600">Loading…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <p className="text-gray-600">Job not found.</p>
        <Link href="/dashboard/contractor/jobs" className="mt-2 inline-block text-sm text-gray-600 hover:underline">
          ← Back to jobs
        </Link>
      </div>
    );
  }

  const { job, assignment } = data;

  return (
    <div className="p-6">
      <Link href="/dashboard/contractor/jobs" className="text-sm text-gray-600 hover:underline">
        ← Back to jobs
      </Link>
      <h1 className="mt-4 text-2xl font-bold">{job.title ?? "Job"}</h1>
      <p className="mt-1 text-gray-600">
        {job.region ?? ""} · {job.scope ?? ""} · {assignment.status}
      </p>
      <p className="mt-2 text-sm text-gray-500">
        Assigned {new Date(assignment.assignedAt).toLocaleString()}
      </p>

      {job.addressFull && (
        <div className="mt-4">
          <span className="font-medium">Address: </span>
          <span>{job.addressFull}</span>
        </div>
      )}

      <div className="mt-6">
        <h2 className="font-semibold">Status</h2>
        <p className="mt-1 text-gray-600">
          {assignment.status === "ASSIGNED" && "Ready to start"}
          {assignment.status === "IN_PROGRESS" && "In progress"}
          {assignment.status === "COMPLETED" && "Completed"}
        </p>
        {assignment.status === "ASSIGNED" && (
          <button
            type="button"
            onClick={handleStartJob}
            disabled={progressAction !== null}
            className="mt-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {progressAction === "start" ? "Starting…" : "Start Job"}
          </button>
        )}
        {assignment.status === "IN_PROGRESS" && (
          <button
            type="button"
            onClick={handleCompleteJob}
            disabled={progressAction !== null}
            className="mt-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {progressAction === "complete" ? "Completing…" : "Mark Complete"}
          </button>
        )}
        {assignment.status === "COMPLETED" && (
          <p className="mt-2 text-sm text-gray-500">This job is complete.</p>
        )}
        {progressError && <p className="mt-2 text-sm text-red-600">{progressError}</p>}
      </div>

      <div className="mt-8">
        <h2 className="font-semibold">Submit Availability (7-day rule)</h2>
        <p className="mt-1 text-sm text-gray-500">
          Submit your availability as JSON (e.g. {`{"dates": ["2025-03-01", "2025-03-02"]}`})
        </p>
        <form onSubmit={handleSubmitAvailability} className="mt-4">
          <textarea
            value={availabilityJson}
            onChange={(e) => setAvailabilityJson(e.target.value)}
            rows={4}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
            placeholder='{"dates": ["2025-03-01"]}'
          />
          {availabilityError && <p className="mt-2 text-sm text-red-600">{availabilityError}</p>}
          <button
            type="submit"
            disabled={availabilitySubmitting}
            className="mt-2 rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {availabilitySubmitting ? "Submitting…" : "Submit Availability"}
          </button>
        </form>
      </div>

      <div className="mt-8 flex gap-4">
        <Link
          href={`/dashboard/contractor/pm?job=${jobId}`}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          P&M Request
        </Link>
        <Link
          href={`/dashboard/contractor/messages?job=${jobId}`}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          Messages
        </Link>
      </div>
      <AccountIncompleteModal
        role="CONTRACTOR"
        missing={missingSteps}
        open={showIncompleteModal}
        onClose={() => setShowIncompleteModal(false)}
      />
    </div>
  );
}
