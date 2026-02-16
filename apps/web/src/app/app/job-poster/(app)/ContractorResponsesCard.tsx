"use client";

import { useEffect, useMemo, useState } from "react";

type ResponseStatus = "AWAITING_APPOINTMENT_PROPOSAL" | "APPOINTMENT_PROPOSED" | "IN_PROGRESS";

type ContractorResponse = {
  job: { id: string; title: string; region: string; status: string };
  contractor: {
    id: string;
    name: string;
    profession: string;
    yearsExperienceRounded: number | null;
    city: string | null;
    state: string | null;
  };
  status: ResponseStatus;
  appointment: null | { day: string | null; timeOfDay: string | null };
  estimatedCompletionDate: string | null;
};

type ApiResp = { ok: true; responses: ContractorResponse[] } | { error: string };

function badge(status: ResponseStatus) {
  switch (status) {
    case "AWAITING_APPOINTMENT_PROPOSAL":
      return { label: "Awaiting Appointment Proposal", cls: "bg-gray-100 text-gray-800 border-gray-200" };
    case "APPOINTMENT_PROPOSED":
      return { label: "Appointment Proposed", cls: "bg-yellow-50 text-yellow-800 border-yellow-200" };
    case "IN_PROGRESS":
      return { label: "In Progress", cls: "bg-green-50 text-green-800 border-green-200" };
  }
}

export function ContractorResponsesCard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<ContractorResponse[]>([]);

  const [open, setOpen] = useState<ContractorResponse | null>(null);
  const [sharing, setSharing] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/app/job-poster/contractor-responses", { cache: "no-store", credentials: "include" });
      const json = (await resp.json().catch(() => ({}))) as ApiResp;
      if (!resp.ok || "error" in json) throw new Error("error" in json ? json.error : "Failed to load");
      setRows(json.responses ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const empty = useMemo(() => !loading && !error && rows.length === 0, [loading, error, rows.length]);

  async function shareContact(jobId: string) {
    setSharing(jobId);
    setError("");
    try {
      const resp = await fetch("/api/app/job-poster/share-contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ jobId })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSharing(null);
    }
  }

  return (
    <div className="border border-gray-200 rounded-2xl p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Contractor Responses</h2>
          <p className="text-gray-600 mt-1">
            Contractors who accepted your job and are scheduling. Contact info stays private until you share it.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold px-4 py-2 rounded-lg"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
      ) : null}

      {loading ? <div className="mt-6 text-gray-600">Loading…</div> : null}

      {empty ? (
        <div className="mt-6 text-gray-600">
          No contractor responses yet. Once a contractor accepts a routed job, they’ll appear here.
        </div>
      ) : null}

      {!loading && rows.length > 0 ? (
        <div className="mt-6 space-y-3">
          {rows.map((r) => {
            const b = badge(r.status);
            const exp =
              r.contractor.yearsExperienceRounded == null ? "—" : `${Math.round(r.contractor.yearsExperienceRounded)} yrs`;
            const loc = [r.contractor.city, r.contractor.state].filter(Boolean).join(", ");

            return (
              <div
                key={`${r.job.id}-${r.contractor.id}`}
                className="border border-gray-200 rounded-xl p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <button onClick={() => setOpen(r)} className="text-left flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-bold text-gray-900">{r.contractor.name}</div>
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold border ${b.cls}`}>
                        {b.label}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {r.contractor.profession} • {exp}
                      {loc ? ` • ${loc}` : ""}
                    </div>
                    <div className="text-sm text-gray-700 mt-2">
                      <span className="font-semibold">Job:</span> {r.job.title}
                    </div>
                    {r.status === "APPOINTMENT_PROPOSED" ? (
                      <div className="text-sm text-gray-700 mt-2">
                        <span className="font-semibold">Appointment Requested:</span>{" "}
                        {r.appointment?.day ?? "—"} {r.appointment?.timeOfDay ? `(${r.appointment.timeOfDay})` : ""}
                      </div>
                    ) : null}
                    {r.estimatedCompletionDate ? (
                      <div className="text-sm text-gray-700 mt-2">
                        <span className="font-semibold">Estimated Completion Date:</span> {r.estimatedCompletionDate}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 mt-2">
                        <span className="font-semibold">Estimated Completion Date:</span> Not set yet
                      </div>
                    )}
                  </button>

                  {r.status === "APPOINTMENT_PROPOSED" ? (
                    <button
                      onClick={() => void shareContact(r.job.id)}
                      disabled={sharing === r.job.id || !r.estimatedCompletionDate}
                      title={
                        !r.estimatedCompletionDate
                          ? "Contractor must set an Estimated Completion Date before you can share contact info."
                          : undefined
                      }
                      className="bg-8fold-green hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500 text-white font-semibold px-4 py-2 rounded-lg"
                    >
                      {!r.estimatedCompletionDate
                        ? "Waiting for completion estimate"
                        : sharing === r.job.id
                          ? "Sharing…"
                          : "Share My Contact Info"}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {open ? <ContractorProfileModal r={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function ContractorProfileModal({ r, onClose }: { r: ContractorResponse; onClose: () => void }) {
  const exp =
    r.contractor.yearsExperienceRounded == null ? "Not provided" : `${Math.round(r.contractor.yearsExperienceRounded)} years`;
  const loc = [r.contractor.city, r.contractor.state].filter(Boolean).join(", ");

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <div className="text-xl font-bold text-gray-900">{r.contractor.name}</div>
            <div className="text-gray-600 mt-1">{r.contractor.profession}</div>
          </div>
          <button
            onClick={onClose}
            className="bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold px-3 py-2 rounded-lg"
          >
            Close
          </button>
        </div>

        <div className="px-6 py-5 space-y-3">
          <div className="text-sm text-gray-700">
            <span className="font-semibold">Years of experience:</span> {exp}
          </div>
          <div className="text-sm text-gray-700">
            <span className="font-semibold">City / State:</span> {loc || "Not provided"}
          </div>
          <div className="text-sm text-gray-700">
            <span className="font-semibold">Estimated Completion Date:</span> {r.estimatedCompletionDate ?? "Not set yet"}
          </div>

          <div className="mt-4 text-xs text-gray-500">
            Contact details remain private until you click <span className="font-semibold">Share My Contact Info</span>.
          </div>
        </div>
      </div>
    </div>
  );
}

