"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { apiFetch } from "@/lib/routerApi";

type Appraisal = {
  id: string;
  jobId: string;
  jobTitle: string;
  originalPriceCents: number | null;
  requestedPriceCents: number;
  differenceCents: number;
  status: string;
  createdAt: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: "Pending Review",
  SENT_TO_POSTER: "Sent to Poster",
  DECLINED: "Declined",
  REJECTED_BY_ADMIN: "Rejected by Admin",
  PAYMENT_PENDING: "Awaiting Payment",
  PAID: "Paid",
  EXPIRED: "Expired",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING_REVIEW: "bg-amber-100 text-amber-800",
  SENT_TO_POSTER: "bg-blue-100 text-blue-800",
  DECLINED: "bg-rose-100 text-rose-800",
  REJECTED_BY_ADMIN: "bg-rose-100 text-rose-800",
  PAYMENT_PENDING: "bg-purple-100 text-purple-800",
  PAID: "bg-emerald-100 text-emerald-800",
  EXPIRED: "bg-slate-100 text-slate-600",
};

function formatMoney(cents: number | null): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function getErrorMessage(input: unknown, fallback: string): string {
  if (typeof input === "string" && input.trim()) return input;
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.trim()) return record.message;
    if (typeof record.error === "string" && record.error.trim()) return record.error;
    if (record.error && typeof record.error === "object") {
      const nested = record.error as Record<string, unknown>;
      if (typeof nested.message === "string" && nested.message.trim()) return nested.message;
    }
  }
  return fallback;
}

function ErrorBanner({ message }: { message: string }) {
  return <div className="mt-6 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</div>;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="mt-8 rounded-xl border border-slate-200 bg-white p-8 text-center">
      <p className="text-slate-500 text-sm">{message}</p>
      <p className="mt-1 text-xs text-slate-400">
        You can request a price revision from within a job&apos;s Messenger thread.
      </p>
    </div>
  );
}

export default function ContractorAppraisalsPage() {
  const { getToken } = useAuth();
  const [appraisals, setAppraisals] = useState<Appraisal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    async function fetchAppraisals() {
      try {
        const res = await apiFetch("/api/web/v4/contractor/appraisals", getToken);
        const payload = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          appraisals?: unknown;
          error?: unknown;
          message?: unknown;
        };

        if (res.status === 401) {
          console.warn("[appraisals] 401 unauthorized");
          return { data: null, error: "Session expired. Please refresh." };
        }

        if (!res.ok) {
          return { data: null, error: getErrorMessage(payload, "Unable to load appraisals") };
        }

        return {
          data: Array.isArray(payload.appraisals) ? (payload.appraisals as Appraisal[]) : [],
          error: "",
        };
      } catch {
        return { data: null, error: "Unable to load appraisals" };
      }
    }

    void (async () => {
      setLoading(true);
      const result = await fetchAppraisals();
      if (!alive) return;
      setAppraisals(Array.isArray(result.data) ? result.data : []);
      setError(typeof result.error === "string" ? result.error : "Unable to load appraisals");
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [getToken]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900">2nd Appraisals</h1>
      <p className="mt-1 text-sm text-slate-600">
        Track the status of your price revision requests.
      </p>

      {loading && (
        <p className="mt-8 text-sm text-slate-500">Loading appraisals…</p>
      )}

      {error ? <ErrorBanner message={error || "Unable to load appraisals"} /> : null}

      {!loading && !error && appraisals.length === 0 ? (
        <EmptyState message="No appraisals yet" />
      ) : null}

      {!loading && appraisals.length > 0 && (
        <div className="mt-6 space-y-3">
          {appraisals.map((a) => {
            const statusLabel = STATUS_LABELS[a.status] ?? a.status;
            const statusColor = STATUS_COLORS[a.status] ?? "bg-slate-100 text-slate-600";
            const diff = a.differenceCents;

            return (
              <div
                key={a.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900 text-sm">{a.jobTitle}</p>
                    <p className="mt-0.5 text-xs text-slate-500">Submitted {formatDate(a.createdAt)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusColor}`}>
                    {statusLabel}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 py-2 px-3">
                    <p className="text-xs text-slate-400">Original Price</p>
                    <p className="mt-0.5 font-bold text-slate-800 text-sm">{formatMoney(a.originalPriceCents)}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 py-2 px-3">
                    <p className="text-xs text-emerald-600">Requested Price</p>
                    <p className="mt-0.5 font-bold text-emerald-700 text-sm">{formatMoney(a.requestedPriceCents)}</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 py-2 px-3">
                    <p className="text-xs text-amber-600">Difference</p>
                    <p className="mt-0.5 font-bold text-amber-700 text-sm">{formatMoney(diff)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
