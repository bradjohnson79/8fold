"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { apiFetch } from "@/lib/routerApi";

type AccountStatus = {
  strikeCount: number;
  activeSuspension?: { suspendedUntil: string; reason?: string | null } | null;
  suspensionExpiry?: string | null;
};

export default function ContractorAccountStatusPage() {
  const { getToken } = useAuth();
  const [data, setData] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await apiFetch("/api/web/v4/contractor/account-status", getToken);
        if (resp.status === 401) {
          if (alive) setError("Authentication lost — please refresh and sign in again.");
          return;
        }
        if (resp.ok) {
          const d = (await resp.json()) as AccountStatus;
          if (alive) setData(d);
        }
      } catch (e: unknown) {
        if (e instanceof Error && (e as any).code === "AUTH_MISSING_TOKEN") {
          if (alive) setError("Authentication lost — please refresh and sign in again.");
        } else {
          if (alive) setData(null);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [getToken]);

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
        <div className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Account Status</h1>
        <p className="mt-1 text-sm text-slate-600">Your strikes and suspension status.</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Strikes</div>
          <div className="mt-1 text-3xl font-bold text-slate-900">{data?.strikeCount ?? 0}</div>
        </div>

        <div className={`rounded-2xl border p-5 shadow-sm ${
          data?.activeSuspension
            ? "border-red-200 bg-red-50"
            : "border-emerald-200 bg-emerald-50"
        }`}>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Suspension Status</div>
          {data?.activeSuspension ? (
            <>
              <div className="mt-1 text-lg font-bold text-red-700">
                Suspended until {new Date(data.activeSuspension.suspendedUntil).toLocaleDateString()}
              </div>
              {data.activeSuspension.reason ? (
                <p className="mt-1 text-sm text-red-600">{data.activeSuspension.reason}</p>
              ) : null}
            </>
          ) : (
            <div className="mt-1 text-lg font-semibold text-emerald-700">Active &mdash; No suspension</div>
          )}
        </div>
      </div>
    </div>
  );
}
