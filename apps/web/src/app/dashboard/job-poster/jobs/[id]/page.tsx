"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { EditJobRequestModal } from "@/components/jobPoster/EditJobRequestModal";
import { CancelJobRequestModal } from "@/components/jobPoster/CancelJobRequestModal";
import { jobStatusLabel, titleCase, formatDate } from "@/utils/jobStatusLabel";

type PendingRequest = { submittedAt: string } | null;

type JobDetail = {
  id: string;
  title: string;
  scope: string;
  status: string;
  routingStatus: string;
  amountCents: number;
  addressFull: string | null;
  tradeCategory: string;
  createdAt: string;
  region?: string | null;
  city?: string | null;
  regionName?: string | null;
  pendingEditRequest?: PendingRequest;
  pendingCancelRequest?: PendingRequest;
  assignedContractorId?: string | null;
};

export default function JobPosterJobDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  const [loadError, setLoadError] = useState<"not_found" | "server_error" | null>(null);

  const fetchJob = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    try {
      const resp = await fetch(`/api/web/v4/job-poster/jobs/${id}`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok) {
        setJob(data as JobDetail);
      } else {
        setJob(null);
        setLoadError(resp.status === 404 ? "not_found" : "server_error");
      }
    } catch {
      setJob(null);
      setLoadError("server_error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchJob();
  }, [id, fetchJob]);

  const isCancelled = job?.status?.toUpperCase() === "CANCELLED";
  const hasPendingEdit = Boolean(job?.pendingEditRequest);
  const hasPendingCancel = Boolean(job?.pendingCancelRequest);
  const hasAssignedContractor = Boolean(job?.assignedContractorId);
  const canEdit = !isCancelled && !hasPendingEdit && !hasAssignedContractor;
  const canCancel = !isCancelled && !hasPendingCancel && !hasAssignedContractor;

  if (!id) {
    return (
      <div className="p-6">
        <p className="text-gray-600">Invalid job.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Job Detail</h1>
        <p className="mt-2 text-gray-600">Loading…</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Job Detail</h1>
        {loadError === "server_error" ? (
          <>
            <p className="mt-2 text-gray-600">We couldn&apos;t load this job right now.</p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  fetchJob();
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Try again
              </button>
              <Link href="/dashboard/job-poster/jobs" className="inline-block text-blue-600 hover:underline py-2">
                ← Back to My Jobs
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-gray-600">Job not found.</p>
            <Link href="/dashboard/job-poster/jobs" className="mt-4 inline-block text-blue-600 hover:underline">
              ← Back to My Jobs
            </Link>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex justify-between items-start gap-4">
        <h1 className="text-2xl font-bold">{job.title}</h1>
        <Link
          href="/dashboard/job-poster/jobs"
          className="text-sm text-blue-600 hover:underline shrink-0"
        >
          ← Back to My Jobs
        </Link>
      </div>

      {successMessage ? (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 text-green-800 text-sm px-4 py-3">
          {successMessage}
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Description</p>
            <p className="mt-1 text-gray-700 whitespace-pre-wrap">{job.scope}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Trade</p>
            <p className="mt-1 text-gray-700">{job.tradeCategory}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Location</p>
            <p className="mt-1 text-gray-700">
              {[job.city, job.regionName ?? titleCase(job.region ?? "")].filter(Boolean).join(", ") || job.addressFull || "—"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</p>
            <p className="mt-1 text-gray-700">{jobStatusLabel(job.status)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Routing Status</p>
            <p className="mt-1 text-gray-700">{jobStatusLabel(job.routingStatus)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Amount</p>
            <p className="mt-1 text-gray-700 font-semibold">${(job.amountCents / 100).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Date Posted</p>
            <p className="mt-1 text-gray-700">{formatDate(job.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Job ID</p>
            <p className="mt-1 text-gray-500 font-mono text-sm">{job.id}</p>
          </div>
        </div>

        {(hasPendingEdit || hasPendingCancel) && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            {hasPendingEdit && (
              <p className="text-sm text-amber-700">
                Edit Request Pending Review
                <br />
                <span className="text-gray-600">
                  Submitted {formatDate(job.pendingEditRequest?.submittedAt)}
                </span>
              </p>
            )}
            {hasPendingCancel && (
              <p className="text-sm text-amber-700 mt-2">
                Cancel Request Pending Review
                <br />
                <span className="text-gray-600">
                  Submitted {formatDate(job.pendingCancelRequest?.submittedAt)}
                </span>
              </p>
            )}
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-gray-100 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setEditModalOpen(true)}
            disabled={!canEdit}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Edit Request
          </button>
          <button
            type="button"
            onClick={() => setCancelModalOpen(true)}
            disabled={!canCancel}
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel Job Request
          </button>
        </div>
      </div>

      <EditJobRequestModal
        job={job}
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSuccess={() => {
          setSuccessMessage("Your request has been submitted and is pending review.");
          fetchJob();
          setTimeout(() => setSuccessMessage(null), 5000);
        }}
      />
      <CancelJobRequestModal
        job={job}
        open={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        onSuccess={() => {
          setSuccessMessage("Your request has been submitted and is pending review.");
          fetchJob();
          setTimeout(() => setSuccessMessage(null), 5000);
        }}
      />
    </div>
  );
}
