"use client";

import React from "react";
import Link from "next/link";

type Ticket = {
  id: string;
  type: "HELP" | "DISPUTE";
  status: string;
  category: string;
  priority: string;
  roleContext: string;
  subject: string;
  assignedToId: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export default function RouterSupportInboxPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [status, setStatus] = React.useState("");
  const [type, setType] = React.useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      if (type) qs.set("type", type);
      const resp = await fetch(`/api/app/router/support/inbox?${qs.toString()}`, { cache: "no-store" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(json?.error ?? "Failed to load");
      setTickets(Array.isArray(json?.tickets) ? json.tickets : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, type]);

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Support Inbox (Senior Router)</h2>
            <p className="text-gray-600 mt-2">
              You can help by replying, requesting info, and guiding users. Admins finalize dispute decisions.
            </p>
          </div>
          <button
            onClick={() => void load()}
            className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-900 font-semibold px-4 py-2 rounded-lg"
          >
            Refresh
          </button>
        </div>

        {error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
        ) : null}

        <div className="flex gap-3 flex-wrap items-center">
          <select
            className="border border-gray-300 rounded-lg px-3 py-2"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="OPEN">OPEN</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="RESOLVED">RESOLVED</option>
            <option value="CLOSED">CLOSED</option>
          </select>
          <select className="border border-gray-300 rounded-lg px-3 py-2" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            <option value="HELP">HELP</option>
            <option value="DISPUTE">DISPUTES</option>
          </select>
          <div className="text-sm text-gray-500">{loading ? "Loading…" : `${tickets.length} shown`}</div>
        </div>

        {loading ? (
          <div className="text-gray-600">Loading…</div>
        ) : tickets.length === 0 ? (
          <div className="text-gray-600">No tickets match your filters.</div>
        ) : (
          <div className="space-y-3">
            {tickets.map((t) => (
              <Link
                key={t.id}
                href={`/app/router/support/inbox/tickets/${t.id}`}
                className="block border border-gray-200 rounded-2xl p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="font-bold text-gray-900">
                    {t.type === "DISPUTE" ? "⚖️ Dispute" : "🆘 Help"} — {t.subject}
                  </div>
                  <div className="text-sm text-gray-600">Status: {t.status}</div>
                </div>
                <div className="text-sm text-gray-600 mt-2">
                  {t.category} • Priority {t.priority} • Updated {new Date(t.updatedAt).toLocaleString()} • Msg {t.messageCount}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

