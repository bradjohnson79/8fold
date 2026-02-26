"use client";

import React, { useEffect, useState } from "react";

type AccountStatus = {
  strikeCount: number;
  activeSuspension?: { suspendedUntil: string; reason?: string | null } | null;
  suspensionExpiry?: string | null;
};

export default function ContractorAccountStatusPage() {
  const [data, setData] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/api/v4/contractor/account-status", {
          cache: "no-store",
          credentials: "include",
        });
        if (resp.ok) {
          const d = (await resp.json()) as AccountStatus;
          setData(d);
        }
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Account Status</h1>
        <p className="mt-2 text-gray-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Account Status</h1>
      <p className="mt-1 text-gray-600">Your strikes and suspension status.</p>

      <div className="mt-6 space-y-4">
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-500">Strikes</p>
          <p className="mt-1 text-2xl font-bold">{data?.strikeCount ?? 0}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-500">Suspension</p>
          <p className="mt-1 font-medium">
            {data?.activeSuspension ? (
              <>Suspended until {new Date(data.activeSuspension.suspendedUntil).toLocaleDateString()}</>
            ) : (
              "Not suspended"
            )}
          </p>
          {data?.activeSuspension?.reason && (
            <p className="mt-2 text-sm text-gray-600">{data.activeSuspension.reason}</p>
          )}
        </div>
      </div>
    </div>
  );
}
