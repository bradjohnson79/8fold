"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { SupportTabs } from "../SupportTabs";

type WebRole = "job-poster" | "router" | "contractor" | null;
type RoleContext = "JOB_POSTER" | "ROUTER" | "CONTRACTOR";

type MyJob = { id: string; title: string; status: string; region: string; publishedAt: string };
type Participants = { jobPosterUserId: string | null; contractorUserId: string | null; routerId: string | null };

type AgainstRole = "JOB_POSTER" | "CONTRACTOR";
type DisputeReason = "PRICING" | "WORK_QUALITY" | "NO_SHOW" | "PAYMENT" | "OTHER";

function roleContextFromWebRole(role: WebRole): RoleContext {
  if (role === "router") return "ROUTER";
  if (role === "contractor") return "CONTRACTOR";
  return "JOB_POSTER";
}

export default function FileDisputePage() {
  const router = useRouter();
  const path = usePathname();
  const base = (() => {
    const idx = path.indexOf("/support");
    if (idx < 0) return "/app/support";
    return path.slice(0, idx) + "/support";
  })();
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  const [role, setRole] = React.useState<WebRole>(null);
  const [jobs, setJobs] = React.useState<MyJob[]>([]);
  const [selectedJobId, setSelectedJobId] = React.useState("");
  const [participants, setParticipants] = React.useState<Participants | null>(null);

  const [againstRole, setAgainstRole] = React.useState<AgainstRole>("CONTRACTOR");
  const [againstUserId, setAgainstUserId] = React.useState("");
  const [reason, setReason] = React.useState<DisputeReason>("OTHER");
  const [subject, setSubject] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [evidenceFiles, setEvidenceFiles] = React.useState<File[]>([]);

  const [createdTicketId, setCreatedTicketId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const meResp = await fetch("/api/app/me", { cache: "no-store" });
        const meJson = (await meResp.json().catch(() => null)) as any;
        if (!alive) return;
        setRole(meJson?.role ?? null);

        const jobsResp = await fetch("/api/app/support/my-jobs", { cache: "no-store" });
        const jobsJson = await jobsResp.json().catch(() => null);
        if (!jobsResp.ok) throw new Error(jobsJson?.error ?? "Failed to load jobs");
        const list = Array.isArray(jobsJson?.data?.jobs) ? jobsJson.data.jobs : Array.isArray(jobsJson?.jobs) ? jobsJson.jobs : [];
        setJobs(list);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      setParticipants(null);
      setAgainstUserId("");
      if (!selectedJobId) return;
      try {
        const resp = await fetch(`/api/app/support/jobs/${selectedJobId}/participants`, { cache: "no-store" });
        const json = await resp.json().catch(() => null);
        if (!resp.ok) throw new Error(json?.error ?? "Failed to load participants");
        if (!alive) return;
        setParticipants(json?.data?.participants ?? json?.participants ?? null);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load participants");
      }
    })();
    return () => {
      alive = false;
    };
  }, [selectedJobId]);

  function computeAgainstUserId(p: Participants | null, ar: AgainstRole): string {
    if (!p) return "";
    return ar === "JOB_POSTER" ? (p.jobPosterUserId ?? "") : (p.contractorUserId ?? "");
  }

  React.useEffect(() => {
    if (!participants) return;
    const id = computeAgainstUserId(participants, againstRole);
    setAgainstUserId(id);
  }, [participants, againstRole]);

  async function submitDispute() {
    setSubmitting(true);
    setError("");
    try {
      if (!selectedJobId) throw new Error("Please select a job.");
      if (!againstUserId) throw new Error("Please select who this dispute is against (job poster/contractor).");
      if (subject.trim().length < 3) throw new Error("Subject is required.");
      if (description.trim().length < 100) throw new Error("Description must be at least 100 characters.");

      const createBody = {
        jobId: selectedJobId,
        againstUserId,
        againstRole,
        disputeReason: reason,
        description: description.trim(),
        subject: subject.trim(),
        roleContext: roleContextFromWebRole(role),
        category: "OTHER",
        priority: "NORMAL",
        message: message.trim() || undefined
      };

      const resp = await fetch("/api/app/support/disputes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createBody)
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(json?.error ?? "Failed to submit dispute");

      const ticketId = (json?.data?.ticketId ?? json?.ticketId) as string | undefined;
      if (!ticketId) throw new Error("Dispute submitted, but ticket id missing.");
      setCreatedTicketId(ticketId);

      // Upload evidence (optional) and add a message with links.
      const uploaded: { name: string; url: string }[] = [];
      for (const f of evidenceFiles) {
        const fd = new FormData();
        fd.set("file", f);
        const up = await fetch(`/api/app/support/tickets/${ticketId}/attachments`, { method: "POST", body: fd });
        const upJson = await up.json().catch(() => null);
        if (!up.ok) throw new Error(upJson?.error ?? "Evidence upload failed");
        const a = upJson?.data?.attachment ?? upJson?.attachment;
        if (a?.id) {
          uploaded.push({ name: a.originalName ?? f.name, url: `/api/app/support/attachments/${a.id}` });
        }
      }
      if (uploaded.length > 0) {
        const evidenceMsg =
          "Evidence uploaded:\n" + uploaded.map((u) => `- ${u.name}: ${u.url}`).join("\n");
        await fetch(`/api/app/support/tickets/${ticketId}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: evidenceMsg })
        });
      }

      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="text-gray-600">Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">⚖️ File a Dispute</h2>
        <p className="text-gray-600 mt-1">Formal disputes are tied to a specific job and users. Private & auditable.</p>
      </div>

      <SupportTabs showDisputes={true} />

      {error ? <div className="text-red-600 font-semibold">{error}</div> : null}

      <div className="flex gap-2 text-sm">
        <StepPill active={step === 1} label="1) Context" />
        <StepPill active={step === 2} label="2) Details + Evidence" />
        <StepPill active={step === 3} label="3) Confirmation" />
      </div>

      {step === 1 ? (
        <div className="space-y-4">
          <div className="border border-gray-200 rounded-2xl p-4">
            <div className="font-bold text-gray-900">Auto-filled context</div>
            <div className="text-gray-600 text-sm mt-2">
              <div>
                <span className="font-semibold">Role:</span> {role ?? "—"}
              </div>
              <div className="mt-1">
                <span className="font-semibold">Jobs involved:</span> {jobs.length}
              </div>
            </div>
          </div>

          <div className="border border-gray-200 rounded-2xl p-4">
            <div className="text-sm font-medium text-gray-700">Select job</div>
            <select
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
            >
              <option value="">Choose a job…</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title} — {j.region} ({j.status})
                </option>
              ))}
            </select>
            <div className="text-xs text-gray-500 mt-2">Only jobs tied to your account appear here.</div>
          </div>

          <div className="flex items-center gap-3">
            <button
              disabled={!selectedJobId}
              onClick={() => setStep(2)}
              className="bg-8fold-green text-white font-semibold px-4 py-2 rounded-lg disabled:opacity-60"
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <div className="border border-gray-200 rounded-2xl p-4">
            <div className="text-sm font-medium text-gray-700">Against who?</div>
            <div className="mt-2 flex gap-3 flex-wrap">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  checked={againstRole === "JOB_POSTER"}
                  onChange={() => setAgainstRole("JOB_POSTER")}
                  disabled={!participants?.jobPosterUserId}
                />
                Job poster
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  checked={againstRole === "CONTRACTOR"}
                  onChange={() => setAgainstRole("CONTRACTOR")}
                  disabled={!participants?.contractorUserId}
                />
                Contractor
              </label>
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Only participants present on the selected job are selectable.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <div className="text-sm font-medium text-gray-700">Dispute reason</div>
              <select
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                value={reason}
                onChange={(e) => setReason(e.target.value as DisputeReason)}
              >
                <option value="PRICING">Pricing</option>
                <option value="WORK_QUALITY">Work quality</option>
                <option value="NO_SHOW">No show</option>
                <option value="PAYMENT">Payment</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label className="block">
              <div className="text-sm font-medium text-gray-700">Subject</div>
              <input
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Short summary"
                maxLength={160}
              />
            </label>
          </div>

          <label className="block">
            <div className="text-sm font-medium text-gray-700">Description</div>
            <textarea
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[140px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what happened, including dates/times and what outcome you are asking for."
              maxLength={5000}
            />
          </label>

          <label className="block">
            <div className="text-sm font-medium text-gray-700">Optional message (first note)</div>
            <textarea
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[90px]"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Anything else you want the team to see first."
              maxLength={5000}
            />
          </label>

          <div className="border border-gray-200 rounded-2xl p-4">
            <div className="font-bold text-gray-900">Evidence upload</div>
            <div className="text-gray-600 text-sm mt-1">Images, documents, PDFs.</div>
            <input
              type="file"
              multiple
              className="block mt-3"
              accept="image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => setEvidenceFiles(Array.from(e.target.files ?? []))}
            />
            {evidenceFiles.length > 0 ? (
              <div className="text-sm text-gray-700 mt-2">{evidenceFiles.length} file(s) selected</div>
            ) : null}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setStep(1)}
              disabled={submitting}
              className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-900 font-semibold px-4 py-2 rounded-lg"
            >
              Back
            </button>
            <button
              onClick={() => void submitDispute()}
              disabled={submitting}
              className="bg-8fold-green text-white font-semibold px-4 py-2 rounded-lg disabled:opacity-60"
            >
              {submitting ? "Submitting..." : "Submit dispute"}
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <div className="border border-gray-200 rounded-2xl p-5 bg-gray-50">
            <div className="text-gray-900 font-bold text-lg">Your dispute has been submitted.</div>
            <div className="text-gray-700 mt-2">
              A decision will be reached within <span className="font-semibold">15 business days</span>.
            </div>
            {createdTicketId ? (
              <div className="mt-4">
                <button
                  onClick={() => router.push(`${base}/tickets/${createdTicketId}`)}
                  className="bg-8fold-green text-white font-semibold px-4 py-2 rounded-lg"
                >
                  View dispute ticket
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StepPill({ active, label }: { active: boolean; label: string }) {
  return (
    <div
      className={
        "px-3 py-1 rounded-full border text-sm " +
        (active ? "bg-8fold-green text-white border-8fold-green" : "bg-white text-gray-700 border-gray-200")
      }
    >
      {label}
    </div>
  );
}

