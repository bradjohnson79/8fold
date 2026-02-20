"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

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

async function safeFetchTickets(userId: string | null | undefined): Promise<{ json: any | null; unauthorized: boolean }> {
  if (!userId) return { json: null, unauthorized: false };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch("/api/app/support/tickets?take=1", {
      cache: "no-store",
      credentials: "include",
      signal: ctrl.signal,
    });
    if (res.status === 401) return { json: null, unauthorized: true };
    if (!res.ok) return { json: null, unauthorized: false };
    return { json: await res.json(), unauthorized: false };
  } catch {
    return { json: null, unauthorized: false };
  } finally {
    clearTimeout(t);
  }
}

async function fetchLatestUpdatedAt(
  userId: string | null | undefined,
): Promise<{ latest: number; unauthorized: boolean }> {
  // Canonical support namespace (role determined by auth, not URL).
  const { json, unauthorized } = await safeFetchTickets(userId);
  if (unauthorized) return { latest: 0, unauthorized: true };
  if (!json) return { latest: 0, unauthorized: false };
  const list = Array.isArray(json?.data?.tickets) ? json.data.tickets : Array.isArray(json?.tickets) ? json.tickets : [];
  const row = list[0] ?? null;
  const ts = row?.updatedAt ? Date.parse(String(row.updatedAt)) : NaN;
  return { latest: Number.isFinite(ts) ? ts : 0, unauthorized: false };
}

export function useSupportInboxBadge(role: Role, opts?: { enabled?: boolean }) {
  const pathname = usePathname();
  const { userId } = useAuth();
  const enabled = opts?.enabled ?? true;
  const inAppShell = pathname === "/app" || pathname.startsWith("/app/");
  const stoppedOnUnauthorized = useRef(false);

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
    stoppedOnUnauthorized.current = false;
  }, [userId]);

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
    if (!inAppShell) {
      setHasUnread(false);
      return;
    }
    if (!userId) {
      setHasUnread(false);
      return;
    }
    if (stoppedOnUnauthorized.current) {
      setHasUnread(false);
      return;
    }
    let cancelled = false;

    async function check() {
      if (onInbox) return;
      const result = await fetchLatestUpdatedAt(userId);
      const lastSeen = getLastSeen(role);
      if (cancelled) return;
      if (result.unauthorized) {
        stoppedOnUnauthorized.current = true;
        setHasUnread(false);
        return;
      }
      if (!lastSeen) {
        // Initialize baseline so the next update can be detected.
        setLastSeen(role, Date.now());
        setHasUnread(false);
        return;
      }
      setHasUnread(result.latest > lastSeen);
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [enabled, inAppShell, onInbox, role, userId]);

  return { inboxHref, hasUnread };
}

