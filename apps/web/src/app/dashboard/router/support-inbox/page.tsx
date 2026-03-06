"use client";

import React from "react";
import { useAuth } from "@clerk/nextjs";
import { routerApiFetch } from "@/lib/routerApi";

type Ticket = {
  id: string;
  subject: string;
  status: string;
  updatedAt: string;
};

export default function RouterSupportInboxPage() {
  const { getToken } = useAuth();
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await routerApiFetch("/api/web/v4/support/tickets?take=50", getToken);
        const json = (await resp.json().catch(() => ({}))) as {
          data?: { tickets?: Ticket[] };
          tickets?: Ticket[];
          error?: { message?: string } | string;
        };
        if (!alive) return;
        if (resp.status === 401) {
          setError("Authentication lost — please refresh and sign in again.");
          return;
        }
        if (!resp.ok) {
          const message = typeof json.error === "string" ? json.error : json.error?.message ?? "Failed to load support inbox";
          setError(message);
          return;
        }
        const rows = Array.isArray(json?.data?.tickets)
          ? json.data!.tickets!
          : Array.isArray(json.tickets)
            ? json.tickets
            : [];
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
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-bold text-slate-900">Support Inbox</h1>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-600">Loading support tickets...</p>
      ) : tickets.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
          No support tickets in your inbox.
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <article key={ticket.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-slate-900">{ticket.subject}</h2>
                  <p className="mt-2 text-xs text-slate-500">Updated {new Date(ticket.updatedAt).toLocaleString()}</p>
                </div>
                <span
                  className={
                    "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium " +
                    (ticket.status === "OPEN"
                      ? "bg-amber-50 text-amber-700"
                      : ticket.status === "RESOLVED"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-600")
                  }
                >
                  {ticket.status}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
