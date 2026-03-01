"use client";

import React from "react";

type Ticket = {
  id: string;
  subject: string;
  status: string;
  updatedAt: string;
};

export default function JobPosterSupportInboxLegacyPage() {
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await fetch("/api/web/v4/support/tickets?take=50", { cache: "no-store", credentials: "include" });
        const json = (await resp.json().catch(() => ({}))) as { data?: { tickets?: Ticket[] }; tickets?: Ticket[]; error?: { message?: string } | string };
        if (!alive) return;
        if (!resp.ok) {
          const message = typeof json.error === "string" ? json.error : json.error?.message ?? "Failed to load support inbox";
          setError(message);
          return;
        }
        const rows = Array.isArray(json?.data?.tickets) ? json.data!.tickets! : Array.isArray(json.tickets) ? json.tickets : [];
        setTickets(rows);
      } catch {
        if (alive) setError("Failed to load support inbox");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-900">Support Inbox</h1>
      {error ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {loading ? (
        <p className="mt-3 text-sm text-slate-600">Loading support tickets...</p>
      ) : tickets.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No support tickets in your inbox.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {tickets.map((ticket) => (
            <article key={ticket.id} className="rounded-xl border border-slate-200 p-4">
              <h2 className="font-semibold text-slate-900">{ticket.subject}</h2>
              <p className="mt-1 text-sm text-slate-700">Status: {ticket.status}</p>
              <p className="mt-2 text-xs text-slate-500">Updated {new Date(ticket.updatedAt).toLocaleString()}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
