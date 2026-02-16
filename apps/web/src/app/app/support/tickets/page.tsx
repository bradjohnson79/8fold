"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SupportTabs } from "../SupportTabs";

function supportBase(pathname: string): string {
  const idx = pathname.indexOf("/support");
  if (idx < 0) return "/app/support";
  return pathname.slice(0, idx) + "/support";
}

type Ticket = {
  id: string;
  createdAt: string;
  updatedAt: string;
  type: "HELP" | "DISPUTE";
  status: string;
  category: string;
  priority: string;
  roleContext: string;
  subject: string;
  assignedToId: string | null;
};

export default function SupportTicketsPage() {
  const path = usePathname();
  const base = supportBase(path);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [showDisputesTab, setShowDisputesTab] = React.useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [ticketsResp, disputesResp, eligibleResp] = await Promise.all([
        fetch("/api/app/support/tickets", { cache: "no-store", credentials: "include" }),
        fetch("/api/app/support/disputes", { cache: "no-store", credentials: "include" }),
        fetch("/api/app/support/disputes/eligible", { cache: "no-store", credentials: "include" }),
      ]);
      const ticketsJson = await ticketsResp.json().catch(() => null);
      const disputesJson = await disputesResp.json().catch(() => null);
      const eligibleJson = await eligibleResp.json().catch(() => null);
      if (!ticketsResp.ok) throw new Error(ticketsJson?.error ?? "Failed to load tickets");
      setTickets(Array.isArray(ticketsJson?.tickets) ? ticketsJson.tickets : []);
      const hasDisputes = disputesResp.ok && Array.isArray(disputesJson?.disputes) && disputesJson.disputes.length > 0;
      const eligible = eligibleResp.ok && Boolean(eligibleJson?.eligible);
      setShowDisputesTab(Boolean(hasDisputes || eligible));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Support</h2>
          <p className="text-gray-600 mt-1">Your private support and dispute tickets.</p>
        </div>
        <button
          onClick={() => void load()}
          className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-900 font-semibold px-4 py-2 rounded-lg"
        >
          Refresh
        </button>
      </div>

      <SupportTabs showDisputes={showDisputesTab} />

      <div className="flex items-center gap-3 flex-wrap">
        <Link href={`${base}/help`} className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-4 py-2 rounded-lg">
          New help ticket
        </Link>
        <Link href={`${base}/dispute`} className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-900 font-semibold px-4 py-2 rounded-lg">
          File a dispute
        </Link>
      </div>

      {error ? <div className="text-red-600 font-semibold">{error}</div> : null}
      {loading ? <div className="text-gray-600">Loading…</div> : null}

      {!loading && tickets.length === 0 ? <div className="text-gray-600">No tickets yet.</div> : null}

      <div className="space-y-3">
        {tickets.map((t) => (
          <Link
            key={t.id}
            href={`${base}/tickets/${t.id}`}
            className="block border border-gray-200 rounded-2xl p-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="font-bold text-gray-900">
                {t.type === "DISPUTE" ? "⚖️ Dispute" : "🆘 Help"} — {t.subject}
              </div>
              <div className="text-sm text-gray-600">Status: {t.status}</div>
            </div>
            <div className="text-sm text-gray-600 mt-2">
              {t.category} • Priority {t.priority} • Updated {new Date(t.updatedAt).toLocaleString()}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

