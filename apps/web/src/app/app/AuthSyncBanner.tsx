"use client";

import { useEffect, useState } from "react";

export function AuthSyncBanner() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch("/api/app/sync-user", {
          method: "POST",
          cache: "no-store",
          credentials: "include",
        });
        const json = (await resp.json().catch(() => null)) as any;
        if (cancelled) return;

        if (resp.status === 401) return;
        if (!json || json.ok !== true) {
          setMessage("We couldn't sync your account. Try again.");
        }
      } catch {
        if (!cancelled) setMessage("We couldn't sync your account. Try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!message) return null;
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{message}</div>
    </div>
  );
}
