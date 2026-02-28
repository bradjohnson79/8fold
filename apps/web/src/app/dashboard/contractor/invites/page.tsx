"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AccountIncompleteModal } from "@/components/modals/AccountIncompleteModal";
import { parseMissingSteps, type MissingStep } from "@/lib/accountIncomplete";

type Invite = {
  id: string;
  jobId: string;
  routeId: string;
  status: string;
  createdAt: string;
  title?: string;
  scope?: string;
  region?: string;
};

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

export default function ContractorInvitesPage() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/api/v4/contractor/invites", {
          cache: "no-store",
          credentials: "include",
        });
        if (resp.ok) {
          const data = (await resp.json()) as { invites?: Invite[] };
          setInvites(Array.isArray(data.invites) ? data.invites : []);
        }
      } catch {
        setInvites([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Invites</h1>
        <p className="mt-2 text-gray-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Invites</h1>
      <p className="mt-1 text-gray-600">Job invites awaiting your response.</p>

      <div className="mt-6">
        {invites.length === 0 ? (
          <p className="text-gray-500">No pending invites.</p>
        ) : (
          <ul className="space-y-4">
            {invites.map((inv) => (
              <InviteCard
                key={inv.id}
                invite={inv}
                onRespond={() => setInvites((prev) => prev.filter((i) => i.id !== inv.id))}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function InviteCard({ invite, onRespond }: { invite: Invite; onRespond: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingSteps, setMissingSteps] = useState<MissingStep[]>([]);
  const [showIncompleteModal, setShowIncompleteModal] = useState(false);

  async function handleAccept() {
    setError(null);
    setLoading(true);
    try {
      const resp = await fetch(`/api/v4/contractor/invites/${encodeURIComponent(invite.jobId)}/accept`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await resp.json().catch(() => ({}))) as ApiErrorBody;
      if (resp.ok) {
        onRespond();
      } else {
        const missing = parseMissingSteps(data);
        if (missing) {
          setMissingSteps(missing);
          setShowIncompleteModal(true);
          return;
        }
        const message = data?.error?.message ?? "Failed to accept";
        setError(message);
      }
    } catch {
      setError("Failed to accept");
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    setError(null);
    setLoading(true);
    try {
      const resp = await fetch(`/api/v4/contractor/invites/${encodeURIComponent(invite.jobId)}/reject`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await resp.json().catch(() => ({}))) as ApiErrorBody;
      if (resp.ok) {
        onRespond();
      } else {
        setError(data?.error?.message ?? "Failed to reject");
      }
    } catch {
      setError("Failed to reject");
    } finally {
      setLoading(false);
    }
  }

  return (
    <li className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">{invite.title ?? "Job"}</h3>
          <p className="mt-1 text-sm text-gray-500">
            {invite.region ?? ""} {invite.scope ?? ""}
          </p>
          <p className="mt-1 text-xs text-gray-400">Invited {new Date(invite.createdAt).toLocaleString()}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/dashboard/contractor/jobs/${invite.jobId}`}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            View
          </Link>
          <button
            type="button"
            onClick={handleAccept}
            disabled={loading}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={handleReject}
            disabled={loading}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </div>

      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      <AccountIncompleteModal
        role="CONTRACTOR"
        missing={missingSteps}
        open={showIncompleteModal}
        onClose={() => setShowIncompleteModal(false)}
      />
    </li>
  );
}
