"use client";

import React from "react";
import { AppointmentCard } from "../AppointmentCard";
import { EstimatedCompletionCard } from "../EstimatedCompletionCard";

type AppointmentResponse = {
  active?: {
    job: { id: string; title: string; status?: string | null };
  } | null;
};

export default function ContractorDashboard() {
  const [activeJob, setActiveJob] = React.useState<AppointmentResponse["active"]>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const resp = await fetch("/api/app/contractor/appointment", { cache: "no-store", credentials: "include" });
      const json = (await resp.json().catch(() => ({}))) as AppointmentResponse;
      if (!alive || !resp.ok) return;
      setActiveJob(json.active ?? null);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <AppointmentCard />
      <EstimatedCompletionCard />
      <p className="text-gray-700">
        This is the contractor dashboard overview. Incentive progress and other tooling will be expanded next.
      </p>
      {activeJob?.job ? (
        <div className="rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-600">Active job: <span className="font-semibold text-gray-900">{activeJob.job.title}</span></div>
          <a
            href={`/app/contractor/jobs/${encodeURIComponent(activeJob.job.id)}/materials`}
            className="mt-3 inline-flex rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Parts &amp; Materials
          </a>
        </div>
      ) : null}
    </div>
  );
}

