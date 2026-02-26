"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

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
  const [paymentReady, setPaymentReady] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/api/v4/contractor/invites", {
          cache: "no-store",
          credentials: "include",
        });
        if (resp.ok) {
          const data = (await resp.json()) as { invites?: Invite[]; paymentReady?: boolean };
          setInvites(Array.isArray(data.invites) ? data.invites : []);
          setPaymentReady(Boolean(data.paymentReady));
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
                paymentReady={paymentReady}
                onRespond={() => setInvites((prev) => prev.filter((i) => i.id !== inv.id))}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function InviteCard({ invite, paymentReady, onRespond }: { invite: Invite; paymentReady: boolean; onRespond: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentBlocked, setPaymentBlocked] = useState(!paymentReady);

  useEffect(() => {
    setPaymentBlocked(!paymentReady);
  }, [paymentReady]);

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
        const code = data?.error?.code ?? "";
        const message = data?.error?.message ?? "Failed to accept";
        if (code === "V4_PAYMENT_SETUP_REQUIRED") {
          setPaymentBlocked(true);
          setError("You must complete Payment Setup before accepting jobs.");
        } else {
          setError(message);
        }
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
            disabled={loading || paymentBlocked || !paymentReady}
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

      {paymentBlocked || !paymentReady ? (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You must complete Payment Setup before accepting jobs. <Link href="/dashboard/contractor/payment" className="font-semibold underline">Go to Payment Setup</Link>
        </div>
      ) : null}

      {error && !paymentBlocked ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </li>
  );
}
