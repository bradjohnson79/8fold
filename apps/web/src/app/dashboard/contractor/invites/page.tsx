"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { AccountIncompleteModal } from "@/components/modals/AccountIncompleteModal";
import { parseMissingSteps, type MissingStep } from "@/lib/accountIncomplete";

type Invite = {
  inviteId: string;
  jobId: string;
  jobTitle: string;
  jobDescription: string;
  jobPosterFirstName: string;
  jobPosterLastName: string;
  tradeCategory: string;
  availability: string;
  contractorAmount: number;
  address: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
};

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

function formatMoney(centsLike: number | null | undefined) {
  const cents = Math.max(0, Number(centsLike ?? 0) || 0);
  return `$${(cents / 100).toFixed(2)}`;
}

function mapEmbedUrl(latitude: number | null, longitude: number | null) {
  if (typeof latitude !== "number" || typeof longitude !== "number") return "";
  return `https://maps.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}&z=14&output=embed`;
}

export default function ContractorInvitesPage() {
  const router = useRouter();
  const [invites, setInvites] = React.useState<Invite[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lockedInviteId, setLockedInviteId] = React.useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = React.useState(false);
  const [redirectingJobId, setRedirectingJobId] = React.useState<string | null>(null);
  const [missingSteps, setMissingSteps] = React.useState<MissingStep[]>([]);
  const [showIncompleteModal, setShowIncompleteModal] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await fetch("/api/contractor/invites", {
          cache: "no-store",
          credentials: "include",
        });
        const data = (await resp.json().catch(() => [])) as Invite[] | ApiErrorBody;
        if (!alive) return;
        if (!resp.ok) {
          const message = Array.isArray(data) ? "Failed to load invites" : data?.error?.message ?? "Failed to load invites";
          setError(message);
          return;
        }
        setInvites(Array.isArray(data) ? data : []);
      } catch {
        if (alive) setError("Failed to load invites");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    if (!showSuccessModal || !redirectingJobId) return;
    const timer = window.setTimeout(() => {
      router.push(`/dashboard/contractor/messages?jobId=${encodeURIComponent(redirectingJobId)}`);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [showSuccessModal, redirectingJobId, router]);

  async function handleAccept(invite: Invite) {
    if (lockedInviteId) return;
    setError(null);
    setLockedInviteId(invite.inviteId);
    try {
      const resp = await fetch(`/api/contractor/invites/${encodeURIComponent(invite.inviteId)}/accept`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await resp.json().catch(() => ({}))) as ApiErrorBody & { jobId?: string };
      if (!resp.ok) {
        const missing = parseMissingSteps(data);
        if (missing) {
          setMissingSteps(missing);
          setShowIncompleteModal(true);
          return;
        }
        setError(data?.error?.message ?? "Failed to accept invite");
        return;
      }
      setRedirectingJobId(String(data.jobId ?? invite.jobId));
      setShowSuccessModal(true);
      setInvites((prev) => prev.filter((item) => item.inviteId !== invite.inviteId));
    } catch {
      setError("Failed to accept invite");
    } finally {
      setLockedInviteId(null);
    }
  }

  async function handleReject(invite: Invite) {
    if (lockedInviteId) return;
    setError(null);
    setLockedInviteId(invite.inviteId);
    try {
      const resp = await fetch(`/api/contractor/invites/${encodeURIComponent(invite.inviteId)}/reject`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await resp.json().catch(() => ({}))) as ApiErrorBody;
      if (!resp.ok) {
        setError(data?.error?.message ?? "Failed to reject invite");
        return;
      }
      setInvites((prev) => prev.filter((item) => item.inviteId !== invite.inviteId));
    } catch {
      setError("Failed to reject invite");
    } finally {
      setLockedInviteId(null);
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-900">Invites</h1>
      <p className="mt-1 text-slate-600">Pending routed jobs waiting for your response.</p>

      {error ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      {loading ? (
        <p className="mt-6 text-slate-600">Loading invites…</p>
      ) : invites.length === 0 ? (
        <p className="mt-6 text-slate-500">No pending invites.</p>
      ) : (
        <div className="mt-6 max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          {invites.map((invite) => {
            const mapUrl = mapEmbedUrl(invite.latitude, invite.longitude);
            const disabled = Boolean(lockedInviteId);
            return (
              <article key={invite.inviteId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">{invite.jobTitle}</h2>
                <div className="mt-3 space-y-1 text-sm text-slate-700">
                  <p>{invite.jobDescription || "No description provided."}</p>
                  <p>
                    <span className="font-medium">Job Poster:</span>{" "}
                    {[invite.jobPosterFirstName, invite.jobPosterLastName].filter(Boolean).join(" ") || "Unknown"}
                  </p>
                  <p><span className="font-medium">Trade Category:</span> {invite.tradeCategory || "General"}</p>
                  <p><span className="font-medium">Poster Availability:</span> {invite.availability || "Not provided"}</p>
                  <p className="text-base font-semibold text-emerald-700">
                    Contractor Amount: {formatMoney(invite.contractorAmount)}
                  </p>
                  <p><span className="font-medium">Address:</span> {invite.address || "Not provided"}</p>
                </div>

                {mapUrl ? (
                  <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                    <iframe
                      title={`Map for ${invite.jobTitle}`}
                      src={mapUrl}
                      loading="lazy"
                      className="h-56 w-full border-0"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleAccept(invite)}
                    disabled={disabled}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Accept Job
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleReject(invite)}
                    disabled={disabled}
                    className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Reject Job
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {showSuccessModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-xl font-semibold text-slate-900">Congratulations!</h3>
            <p className="mt-2 text-sm text-slate-700">
              Stand by while you&apos;re redirected to the messenger to contact your client.
            </p>
          </div>
        </div>
      ) : null}

      <AccountIncompleteModal
        role="CONTRACTOR"
        missing={missingSteps}
        open={showIncompleteModal}
        onClose={() => setShowIncompleteModal(false)}
      />
    </div>
  );
}
