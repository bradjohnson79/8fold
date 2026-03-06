"use client";

import React from "react";
import { useAuth } from "@clerk/nextjs";
import { apiFetch } from "@/lib/routerApi";

type Ticket = {
  id: string;
  subject: string;
  status: string;
  updatedAt: string;
};

export default function ContractorSupportInboxPage() {
  const { getToken } = useAuth();
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await apiFetch("/api/web/v4/support/tickets?take=50", getToken);
        if (resp.status === 401) {
          if (alive) setError("Authentication lost — please refresh and sign in again.");
          return;
        }
        const json = (await resp.json().catch(() => ({}))) as {
          data?: { tickets?: Ticket[] };
          tickets?: Ticket[];
          error?: { message?: string } | string;
        };
        if (!alive) return;
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
      } catch (e: unknown) {
        if (e instanceof Error && (e as any).code === "AUTH_MISSING_TOKEN") {
          if (alive) setError("Authentication lost — please refresh and sign in again.");
        } else {
          if (alive) setError("Failed to load support inbox");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [getToken]);

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Support Inbox</h1>
        <p className="mt-1 text-sm text-slate-600">View your support ticket history.</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-slate-500">No support tickets in your inbox.</p>
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
