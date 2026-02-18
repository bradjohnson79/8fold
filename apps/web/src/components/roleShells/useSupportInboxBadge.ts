"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type Role = "router" | "job-poster" | "contractor";

function storageKey(role: Role) {
  return `supportInboxLastSeenAt:${role}`;
}

function getLastSeen(role: Role): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(storageKey(role));
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

function setLastSeen(role: Role, ms: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(role), String(ms));
}

async function fetchLatestUpdatedAt(role: Role): Promise<number> {
  // Canonical support namespace (role determined by auth, not URL).
  const url = "/api/app/support/tickets?take=1";

  const resp = await fetch(url, { cache: "no-store" });
  const json = (await resp.json().catch(() => null)) as any;
  if (!resp.ok) return 0;
  const list = Array.isArray(json?.data?.tickets) ? json.data.tickets : Array.isArray(json?.tickets) ? json.tickets : [];
  const row = list[0] ?? null;
  const ts = row?.updatedAt ? Date.parse(String(row.updatedAt)) : NaN;
  return Number.isFinite(ts) ? ts : 0;
}

export function useSupportInboxBadge(role: Role, opts?: { enabled?: boolean }) {
  const pathname = usePathname();
  const enabled = opts?.enabled ?? true;

  const inboxHref = useMemo(() => {
    if (role === "router") return "/app/router/support/inbox";
    if (role === "job-poster") return "/app/job-poster/support/inbox";
    return "/app/contractor/support/inbox";
  }, [role]);

  const legacyRouterInboxHref = "/app/router/support-inbox";
  const onInbox =
    pathname === inboxHref ||
    pathname.startsWith(inboxHref + "/") ||
    (role === "router" && (pathname === legacyRouterInboxHref || pathname.startsWith(legacyRouterInboxHref + "/")));

  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (!onInbox) return;
    const now = Date.now();
    setLastSeen(role, now);
    setHasUnread(false);
  }, [enabled, onInbox, role]);

  useEffect(() => {
    if (!enabled) {
      setHasUnread(false);
      return;
    }
    let cancelled = false;

    async function check() {
      if (onInbox) return;
      const latest = await fetchLatestUpdatedAt(role);
      const lastSeen = getLastSeen(role);
      if (cancelled) return;
      if (!lastSeen) {
        // Initialize baseline so the next update can be detected.
        setLastSeen(role, Date.now());
        setHasUnread(false);
        return;
      }
      setHasUnread(latest > lastSeen);
    }

    void check();
    const t = window.setInterval(() => void check(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [enabled, onInbox, role]);

  return { inboxHref, hasUnread };
}

