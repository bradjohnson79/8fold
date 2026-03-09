"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { routerApiFetch } from "@/lib/routerApi";
import AvailabilityBadge from "@/components/AvailabilityBadge";
import StatusBadge from "@/components/StatusBadge";
import CertificationThumbnails from "@/components/contractors/CertificationThumbnails";

type CertPreview = {
  certificationName: string;
  certificateImageUrl: string;
  verified: boolean;
  issuingOrganization: string | null;
};

type InvitedContractor = {
  contractorId: string;
  contactName: string;
  businessName: string;
  city: string | null;
  distanceKm: number | null;
  distanceMiles: number | null;
  availabilityStatus: "AVAILABLE" | "BUSY";
  certifications: CertPreview[];
};

type Job = {
  id: string;
  title: string;
  region: string;
  status: string;
  routingStatus: string;
  countryCode: string;
  claimedAt: string | null;
  routedAt: string | null;
  invitedContractors: InvitedContractor[];
};

export default function RouterRoutedJobsPage() {
  const { getToken } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await routerApiFetch("/api/web/v4/router/jobs/routed", getToken);
        const json = (await resp.json().catch(() => null)) as any;
        if (!alive) return;
        if (resp.status === 401) {
          setError("Authentication lost — please refresh and sign in again.");
          return;
        }
        if (!resp.ok) {
          setError(json?.error?.message ?? json?.error ?? "Failed to load jobs");
          return;
        }
        setJobs(json.jobs ?? []);
      } catch {
        if (alive) setError("Failed to load jobs");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <div className="p-6 text-slate-600">Loading routed jobs...</div>;

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-bold text-slate-900">Routed Jobs</h1>
      {jobs.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
          No routed jobs yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => (
            <li key={job.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">{job.title}</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {job.region} &middot; {job.routingStatus}
                  </div>
                </div>
                <StatusBadge status={job.status} />
              </div>
              {job.routedAt ? (
                <div className="mt-2 text-xs text-slate-500">
                  Routed: {new Date(job.routedAt).toLocaleString()}
                </div>
              ) : null}
              <div className="mt-3">
                <div className="text-sm font-medium text-slate-600">Invited Contractors</div>
                {job.invitedContractors?.length ? (
                  <div className="mt-2 space-y-2">
                    {job.invitedContractors.map((c) => {
                      const distance =
                        c.distanceKm != null
                          ? job.countryCode === "US"
                            ? `${(c.distanceMiles ?? 0).toFixed(1)} mi`
                            : `${Math.round(c.distanceKm)} km`
                          : null;
                        return (
                        <div key={c.contractorId} className="text-sm">
                          <div className="font-medium text-slate-800">
                            {c.contactName} &mdash; {c.businessName}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                            {c.city ? <span>{c.city}</span> : null}
                            {c.city && distance ? <span>&middot;</span> : null}
                            {distance ? <span>{distance}</span> : null}
                            {(c.city || distance) && <span>&middot;</span>}
                            <AvailabilityBadge status={c.availabilityStatus} />
                          </div>
                          {c.certifications && c.certifications.length > 0 ? (
                            <CertificationThumbnails certifications={c.certifications} />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-slate-400">No contractors invited yet</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
