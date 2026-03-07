"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { apiFetch } from "@/lib/routerApi";
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
  availability: Record<string, Record<string, boolean>> | string | null;
  contractorAmount: number;
  address: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  expiresAt: string;
};

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

type InviteListResponse = {
  serverTime: string;
  invites: Invite[];
};

function formatMoney(centsLike: number | null | undefined) {
  const cents = Math.max(0, Number(centsLike ?? 0) || 0);
  return `$${(cents / 100).toFixed(2)}`;
}

function mapEmbedUrl(latitude: number | null, longitude: number | null) {
  if (typeof latitude !== "number" || typeof longitude !== "number") return "";
  return `https://maps.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}&z=14&output=embed`;
}

function refreshIntervalMs(remainingMs: number): number {
  if (remainingMs <= 10 * 60 * 1000) return 60 * 1000;
  if (remainingMs <= 15 * 60 * 1000) return 5 * 60 * 1000;
  if (remainingMs <= 30 * 60 * 1000) return 15 * 60 * 1000;
  if (remainingMs <= 60 * 60 * 1000) return 30 * 60 * 1000;
  return 60 * 60 * 1000;
}

function formatCountdown(remainingMs: number): string {
  const totalMinutes = Math.max(0, Math.ceil(remainingMs / (60 * 1000)));
  if (totalMinutes >= 60) {
    const hours = Math.ceil(totalMinutes / 60);
    return `${hours} ${hours === 1 ? "Hour" : "Hours"}`;
  }
  return `${totalMinutes} ${totalMinutes === 1 ? "Minute" : "Minutes"}`;
}

const SLOT_ORDER = ["morning", "afternoon", "evening"];

function formatAvailability(avail: Record<string, Record<string, boolean>> | string | null | undefined): string {
  if (!avail) return "Not specified";
  let obj: Record<string, Record<string, boolean>>;
  if (typeof avail === "string") {
    try { obj = JSON.parse(avail); } catch { return avail; }
  } else {
    obj = avail;
  }
  if (typeof obj !== "object" || obj === null) return "Not specified";
  const days = Object.entries(obj)
    .map(([day, slots]) => {
      if (typeof slots !== "object" || slots === null) return null;
      const active = SLOT_ORDER
        .filter((slot) => slots?.[slot])
        .map((slot) => slot.charAt(0).toUpperCase() + slot.slice(1));
      if (!active.length) return null;
      return `${day.charAt(0).toUpperCase() + day.slice(1)} — ${active.join(", ")}`;
    })
    .filter(Boolean) as string[];
  return days.length ? days.join(" | ") : "Not specified";
}

function countdownTone(remainingMs: number): string {
  if (remainingMs <= 10 * 60 * 1000) return "text-rose-700";
  if (remainingMs <= 60 * 60 * 1000) return "text-amber-700";
  return "text-slate-600";
}

export default function ContractorInvitesPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const [invites, setInvites] = React.useState<Invite[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lockedInviteId, setLockedInviteId] = React.useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = React.useState(false);
  const [redirectingJobId, setRedirectingJobId] = React.useState<string | null>(null);
  const [missingSteps, setMissingSteps] = React.useState<MissingStep[]>([]);
  const [showIncompleteModal, setShowIncompleteModal] = React.useState(false);
  const [serverOffsetMs, setServerOffsetMs] = React.useState(0);
  const [clockMs, setClockMs] = React.useState(() => Date.now());
  const visibleInvites = React.useMemo(
    () =>
      invites.filter((invite) => {
        const remainingMs = new Date(invite.expiresAt).getTime() - (clockMs + serverOffsetMs);
        return Number.isFinite(remainingMs) && remainingMs > 0;
      }),
    [invites, clockMs, serverOffsetMs],
  );

  const loadInvites = React.useCallback(async (aliveRef?: { current: boolean }) => {
    try {
      const requestStartedAt = Date.now();
      const resp = await apiFetch("/api/web/v4/contractor/invites", getToken);
      if (resp.status === 401) {
        if (!aliveRef || aliveRef.current) setError("Authentication lost — please refresh and sign in again.");
        return;
      }
      const data = (await resp.json().catch(() => null)) as InviteListResponse | ApiErrorBody | null;
      if (aliveRef && !aliveRef.current) return;
      if (!resp.ok || !data || !("invites" in data)) {
        const message = data && "error" in data ? data?.error?.message ?? "Failed to load invites" : "Failed to load invites";
        setError(message);
        return;
      }
      const serverTimeMs = new Date(data.serverTime).getTime();
      if (Number.isFinite(serverTimeMs)) {
        setServerOffsetMs(serverTimeMs - requestStartedAt);
      }
      setInvites(Array.isArray(data.invites) ? data.invites : []);
      setClockMs(Date.now());
    } catch (e: unknown) {
      if (e instanceof Error && (e as any).code === "AUTH_MISSING_TOKEN") {
        if (!aliveRef || aliveRef.current) setError("Authentication lost — please refresh and sign in again.");
      } else {
        if (!aliveRef || aliveRef.current) setError("Failed to load invites");
      }
    } finally {
      if (!aliveRef || aliveRef.current) setLoading(false);
    }
  }, [getToken]);

  React.useEffect(() => {
    const alive = { current: true };
    (async () => {
      await loadInvites(alive);
    })();
    return () => {
      alive.current = false;
    };
  }, [loadInvites]);

  React.useEffect(() => {
    if (invites.length === 0) return;
    const nowMs = Date.now() + serverOffsetMs;
    const remainingMs = invites.map((invite) => new Date(invite.expiresAt).getTime() - nowMs);
    const active = remainingMs.filter((ms) => Number.isFinite(ms) && ms > 0);
    if (active.length === 0) {
      setInvites([]);
      void loadInvites();
      return;
    }
    const nextMs = Math.min(...active);
    const delay = Math.max(10 * 1000, Math.min(refreshIntervalMs(nextMs), nextMs));
    const timer = window.setTimeout(() => {
      const currentServerMs = Date.now() + serverOffsetMs;
      setClockMs(Date.now());
      setInvites((prev) =>
        prev.filter((invite) => {
          const expiresMs = new Date(invite.expiresAt).getTime();
          return Number.isFinite(expiresMs) && expiresMs > currentServerMs;
        }),
      );
      if (nextMs <= delay) void loadInvites();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [invites, loadInvites, serverOffsetMs]);

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
      const resp = await apiFetch(
        `/api/web/v4/contractor/invites/${encodeURIComponent(invite.inviteId)}/accept`,
        getToken,
        { method: "POST" },
      );
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
      const resp = await apiFetch(
        `/api/web/v4/contractor/invites/${encodeURIComponent(invite.inviteId)}/reject`,
        getToken,
        { method: "POST" },
      );
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

      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="mt-6 space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-slate-50" />
          ))}
        </div>
      ) : visibleInvites.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-slate-500">No pending invites.</p>
        </div>
      ) : (
        <div className="mt-6 max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          {visibleInvites.map((invite) => {
            const mapUrl = mapEmbedUrl(invite.latitude, invite.longitude);
            const disabled = Boolean(lockedInviteId);
            const remainingMs = new Date(invite.expiresAt).getTime() - (clockMs + serverOffsetMs);
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
                  <p><span className="font-medium">Poster Availability:</span> {formatAvailability(invite.availability)}</p>
                  <p className="text-base font-semibold text-emerald-700">
                    Contractor Amount: {formatMoney(invite.contractorAmount)}
                  </p>
                  <p><span className="font-medium">Address:</span> {invite.address || "Not provided"}</p>
                  <p className={`font-medium ${countdownTone(remainingMs)}`}>
                    Expires in: {formatCountdown(remainingMs)}
                  </p>
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
