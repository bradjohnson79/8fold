"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { apiFetch } from "@/lib/routerApi";

type Ticket = {
  id: string;
  subject: string;
  category: string;
  ticketType: string | null;
  status: string;
  priority: string;
  jobId: string | null;
  createdAt: string;
  updatedAt: string;
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-700",
  ADMIN_REPLY: "bg-emerald-100 text-emerald-700",
  USER_REPLY: "bg-amber-100 text-amber-700",
  RESOLVED: "bg-slate-100 text-slate-500",
  CLOSED: "bg-slate-200 text-slate-400",
};

export function SupportInbox({ basePath, newTicketPath }: { basePath: string; newTicketPath: string }) {
  const { getToken } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiFetch("/api/web/v4/support/tickets?take=50", getToken);
      const data = await resp.json().catch(() => ({})) as { tickets?: Ticket[]; error?: { message?: string } | string };
      if (!resp.ok) {
        setError(typeof data.error === "string" ? data.error : data.error?.message ?? "Failed to load tickets");
        return;
      }
      setTickets(Array.isArray(data.tickets) ? data.tickets : []);
    } catch {
      setError("Failed to load support inbox");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Support Inbox</h1>
          <p className="mt-1 text-sm text-slate-500">All your support tickets in one place.</p>
        </div>
        <Link
          href={newTicketPath}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          + New Ticket
        </Link>
      </div>

      {error ? (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="text-sm text-slate-500">Loading tickets...</div>
      ) : tickets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
          <p className="text-slate-500">No support tickets yet.</p>
          <Link href={newTicketPath} className="mt-3 inline-block text-sm font-semibold text-emerald-600 hover:underline">
            Submit your first ticket
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <Link key={t.id} href={`${basePath}/${t.id}`} className="block">
              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold text-slate-900">{t.subject}</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {t.ticketType ?? t.category}
                      {t.jobId ? ` · Job: ${t.jobId.slice(0, 8)}…` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[t.status] ?? "bg-slate-100 text-slate-500"}`}
                  >
                    {t.status.replace("_", " ")}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Updated {new Date(t.updatedAt).toLocaleString()}
                </p>
              </article>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
