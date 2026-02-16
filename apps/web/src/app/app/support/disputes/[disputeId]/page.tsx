"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SupportTabs } from "../../SupportTabs";

function supportBase(pathname: string): string {
  const idx = pathname.indexOf("/support");
  if (idx < 0) return "/app/support";
  return pathname.slice(0, idx) + "/support";
}

function getDisputeIdFromPath(): string {
  if (typeof window === "undefined") return "";
  const parts = window.location.pathname.split("/");
  const idx = parts.indexOf("disputes") + 1;
  return parts[idx] ?? "";
}

type Evidence = {
  id: string;
  createdAt: string;
  submittedByUserId: string;
  kind: string;
  summary: string | null;
  url: string | null;
};

type DisputeDetail = {
  id: string;
  createdAt: string;
  status: string;
  filedByUserId: string;
  againstUserId: string;
  disputeReason: string;
  ticketSubject: string;
  jobId: string;
  deadlineAt: string;
  job: {
    id: string;
    title: string;
    status: string;
    paymentStatus: string | null;
    payoutStatus: string | null;
    routerApprovedAt: string | null;
    contractorCompletedAt?: string | null;
    customerApprovedAt?: string | null;
  };
  statements: { jobPoster: string | null; contractor: string | null };
};

function flowStep(
  status: string,
  evidenceCount: number,
): "DISPUTED" | "EVIDENCE" | "VOTING" | "RESOLVED" | "CLOSED" {
  const s = String(status ?? "").toUpperCase();
  if (s === "CLOSED") return "CLOSED";
  if (s === "DECIDED") return "RESOLVED";
  if (evidenceCount > 0) return "EVIDENCE";
  return "DISPUTED";
}

export default function DisputeDetailPage() {
  const disputeId = getDisputeIdFromPath();
  const path = usePathname();
  const base = supportBase(path);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [detail, setDetail] = React.useState<DisputeDetail | null>(null);
  const [evidence, setEvidence] = React.useState<Evidence[]>([]);

  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [dResp, eResp] = await Promise.all([
        fetch(`/api/app/support/disputes/${encodeURIComponent(disputeId)}`, { cache: "no-store" }),
        fetch(`/api/app/support/disputes/${encodeURIComponent(disputeId)}/evidence`, { cache: "no-store" }),
      ]);
      const dJson = await dResp.json().catch(() => null);
      const eJson = await eResp.json().catch(() => null);
      if (!dResp.ok) throw new Error(dJson?.error ?? "Failed to load dispute");
      setDetail(dJson?.dispute ?? null);
      setEvidence(eResp.ok && Array.isArray(eJson?.evidence) ? eJson.evidence : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    const d = desc.trim();
    if (d.length < 1) {
      setUploadError("Short description is required.");
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("description", d);
        const resp = await fetch(`/api/app/support/disputes/${encodeURIComponent(disputeId)}/evidence`, {
          method: "POST",
          body: fd,
        });
        const json = await resp.json().catch(() => null);
        if (!resp.ok) throw new Error(json?.error ?? "Evidence upload failed");
      }
      setDesc("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Dispute</h2>
          <p className="text-gray-600 mt-1">No voting is shown to users. Payout remains frozen until resolution.</p>
        </div>
        <Link href={`${base}/disputes`} className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-900 font-semibold px-4 py-2 rounded-lg">
          Back to disputes
        </Link>
      </div>

      <SupportTabs showDisputes={true} />

      {error ? <div className="text-red-600 font-semibold">{error}</div> : null}
      {loading ? <div className="text-gray-600">Loading…</div> : null}

      {!loading && detail ? (
        <>
          {/* State flow */}
          <div className="border border-gray-200 rounded-2xl p-5 bg-white">
            <div className="font-bold text-gray-900">State</div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
              <Pill label="ACTIVE" done />
              <Pill label="DISPUTED" active={flowStep(detail.status, evidence.length) === "DISPUTED"} />
              <Pill label="EVIDENCE" active={flowStep(detail.status, evidence.length) === "EVIDENCE"} />
              <Pill label="VOTING" active={flowStep(detail.status, evidence.length) === "VOTING"} />
              <Pill label="RESOLVED" active={flowStep(detail.status, evidence.length) === "RESOLVED"} />
              <Pill label="CLOSED" active={flowStep(detail.status, evidence.length) === "CLOSED"} />
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Disputed jobs show a red badge everywhere and freeze payout until resolution.
            </div>
          </div>

          {/* 1) Overview */}
          <div className="border border-gray-200 rounded-2xl p-5">
            <div className="font-bold text-gray-900">1) Overview</div>
            <div className="text-sm text-gray-700 mt-3 space-y-1">
              <div>
                <span className="font-semibold">Status:</span> {detail.status}
              </div>
              <div>
                <span className="font-semibold">Opened by:</span> {detail.filedByUserId}
              </div>
              <div>
                <span className="font-semibold">Category:</span> {detail.disputeReason}
              </div>
              <div>
                <span className="font-semibold">Created:</span> {new Date(detail.createdAt).toLocaleString()}
              </div>
              <div className="pt-2 text-xs text-gray-500">
                Job: <span className="font-mono">{detail.jobId}</span> • {detail.job?.title}
              </div>
            </div>
          </div>

          {/* 2) Statements */}
          <div className="border border-gray-200 rounded-2xl p-5">
            <div className="font-bold text-gray-900">2) Statements</div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                <div className="text-sm font-semibold text-gray-900">Poster statement</div>
                <div className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">
                  {detail.statements?.jobPoster ?? "—"}
                </div>
              </div>
              <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                <div className="text-sm font-semibold text-gray-900">Contractor statement</div>
                <div className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">
                  {detail.statements?.contractor ?? "—"}
                </div>
              </div>
            </div>
          </div>

          {/* 3) Evidence Upload */}
          <div className="border border-gray-200 rounded-2xl p-5">
            <div className="font-bold text-gray-900">3) Evidence Upload</div>
            <div className="text-sm text-gray-600 mt-1">JPG, PNG, HEIC, PDF.</div>

            {uploadError ? <div className="text-red-600 font-semibold mt-3">{uploadError}</div> : null}

            <div
              className="mt-4 border-2 border-dashed border-gray-300 rounded-2xl p-6 bg-gray-50"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void uploadSelected(e.dataTransfer.files);
              }}
            >
              <div className="text-gray-900 font-semibold">Drag &amp; drop files here</div>
              <div className="text-gray-600 text-sm mt-1">or select files below.</div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block">
                  <div className="text-sm font-medium text-gray-700">Short description (required)</div>
                  <input
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="e.g. Photo of completed work, receipt, chat log…"
                  />
                </label>
                <label className="block">
                  <div className="text-sm font-medium text-gray-700">File</div>
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/heic,image/heif,application/pdf"
                    disabled={uploading}
                    className="mt-1 w-full"
                    onChange={(e) => void uploadSelected(e.target.files)}
                  />
                </label>
              </div>
              <div className="text-xs text-gray-500 mt-3">
                Notice: Opening a dispute freezes payout until resolution.
              </div>
            </div>

            {evidence.length ? (
              <div className="mt-4 space-y-2">
                {evidence.map((ev) => (
                  <div key={ev.id} className="border border-gray-200 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-sm text-gray-800">
                      <div className="font-semibold">{ev.summary ?? "Evidence"}</div>
                      <div className="text-xs text-gray-500">{new Date(ev.createdAt).toLocaleString()}</div>
                    </div>
                    {ev.url ? (
                      <a className="text-8fold-green font-semibold text-sm" href={ev.url}>
                        Download →
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-600 mt-4 text-sm">No evidence uploaded yet.</div>
            )}
          </div>

          {/* 4) Timeline (v1: minimal) */}
          <div className="border border-gray-200 rounded-2xl p-5">
            <div className="font-bold text-gray-900">4) Timeline</div>
            <div className="text-sm text-gray-600 mt-1">
              Auto-generated log of completion, dispute, evidence, and resolution events.
            </div>
            <div className="mt-4 space-y-2 text-sm text-gray-700">
              {detail.job?.contractorCompletedAt ? (
                <div>• Contractor submitted completion: {new Date(detail.job.contractorCompletedAt).toLocaleString()}</div>
              ) : null}
              {detail.job?.customerApprovedAt ? (
                <div>• Poster confirmed completion: {new Date(detail.job.customerApprovedAt).toLocaleString()}</div>
              ) : null}
              {detail.job?.routerApprovedAt ? (
                <div>• Router confirmed completion: {new Date(detail.job.routerApprovedAt).toLocaleString()}</div>
              ) : null}
              <div>• Dispute opened: {new Date(detail.createdAt).toLocaleString()}</div>
              {evidence.map((ev) => (
                <div key={ev.id}>• Evidence added: {new Date(ev.createdAt).toLocaleString()}</div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Pill({ label, active, done }: { label: string; active?: boolean; done?: boolean }) {
  const cls = done
    ? "inline-flex px-2 py-1 rounded-full border bg-green-50 text-green-800 border-green-200"
    : active
      ? "inline-flex px-2 py-1 rounded-full border bg-red-50 text-red-800 border-red-200"
      : "inline-flex px-2 py-1 rounded-full border bg-gray-50 text-gray-700 border-gray-200";
  return <span className={cls}>{label}</span>;
}

