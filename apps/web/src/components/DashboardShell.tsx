"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useClerk } from "@clerk/nextjs";

type Item = { href: string; label: string };
type Badge = { kind: "dot" } | { kind: "count"; value: number };
type ItemWithBadge = Item & { badge?: Badge };

type BellRole = "job-poster" | "contractor" | "router" | null;

type BellNotification = {
  id: string;
  title: string;
  body?: string;
  createdAt: string;
  readAt?: string | null;
  jobId?: string;
};

export function DashboardShell({
  title,
  items,
  navMode = "sidebar",
  extraUnreadCount,
  children
}: {
  title: string;
  items: ItemWithBadge[];
  navMode?: "sidebar" | "none";
  extraUnreadCount?: number;
  children: React.ReactNode;
}) {
  const { signOut } = useClerk();
  const path = usePathname();
  const router = useRouter();
  const [boot, setBoot] = useState<
    | { loading: true }
    | { loading: false; ok: true; superuser: boolean }
    | { loading: false; ok: false; code: string }
  >({ loading: true });
  const [loggingOut, setLoggingOut] = useState(false);

  const bellRole: BellRole = path.startsWith("/app/job-poster")
    ? "job-poster"
    : path.startsWith("/app/contractor")
      ? "contractor"
      : path.startsWith("/app/router")
        ? "router"
        : null;

  const [bellOpen, setBellOpen] = useState(false);
  const [bellLoading, setBellLoading] = useState(false);
  const [bellError, setBellError] = useState("");
  const [bellNotifications, setBellNotifications] = useState<BellNotification[]>([]);
  const [bellUnread, setBellUnread] = useState<number>(0);

  function extractAuthCode(json: any): string {
    const code = String(json?.error?.code ?? json?.code ?? json?.error?.code ?? "");
    return code || "UNAUTHENTICATED";
  }

  useEffect(() => {
    let cancelled = false;
    let bootAttempt = 0;
    (async () => {
      try {
        const delaysMs = [0, 80, 160, 260, 420, 700] as const; // ~1.6s

        for (let i = 0; i < delaysMs.length; i++) {
          if (cancelled) return;
          bootAttempt = i + 1;
          const delay = delaysMs[i]!;
          if (delay) await new Promise((r) => setTimeout(r, delay));
          if (cancelled) return;

          const resp = await fetch("/api/app/me", { cache: "no-store", credentials: "include" });
          const json = (await resp.json().catch(() => null)) as any;
          if (cancelled) return;

          const code = extractAuthCode(json);
          const isPendingAuth =
            resp.status === 401 && (code === "AUTH_TOKEN_PENDING" || code === "AUTH_TOKEN_TIMEOUT");

          if (isPendingAuth) {
            if (process.env.NODE_ENV !== "production") {
              // eslint-disable-next-line no-console
              console.log("[WEB AUTH] dashboard bootstrap pending; retrying", { attempt: bootAttempt, code });
            }
            setBoot({ loading: true });
            continue;
          }

          if (!resp.ok) {
            setBoot({ loading: false, ok: false, code });
            return;
          }
          if (json?.ok === false) {
            setBoot({ loading: false, ok: false, code });
            return;
          }
          setBoot({ loading: false, ok: true, superuser: Boolean(json?.superuser) });
          return;
        }

        // Final fallback: treat as unauthenticated (no infinite loading).
        setBoot({ loading: false, ok: false, code: "AUTH_BOOTSTRAP_TIMEOUT" });
      } catch {
        if (!cancelled) setBoot({ loading: false, ok: false, code: "BOOTSTRAP_FAILED" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadBell() {
    if (!bellRole) return;
    setBellLoading(true);
    setBellError("");
    try {
      const resp = await fetch(`/api/app/${bellRole}/notifications`, { cache: "no-store", credentials: "include" });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error || "Failed to load notifications");

      const rows = Array.isArray((json as any)?.notifications) ? ((json as any).notifications as BellNotification[]) : [];
      const unreadCountRaw = (json as any)?.unreadCount;
      const unreadCount =
        typeof unreadCountRaw === "number"
          ? unreadCountRaw
          : rows.filter((n) => (n as any)?.readAt == null).length;

      setBellNotifications(rows);
      setBellUnread(unreadCount);
    } catch (e) {
      setBellError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setBellLoading(false);
    }
  }

  async function markBellRead(ids: string[]) {
    if (!bellRole) return;
    if (!ids.length) return;
    try {
      await fetch(`/api/app/${bellRole}/notifications/mark-read`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids }),
      });
    } catch {
      // best-effort
    }
  }

  useEffect(() => {
    if (!bellOpen) return;
    void loadBell();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bellOpen, bellRole]);

  // Bootstrap sequencing: do not mount dashboard children until we know auth/session state.
  // This prevents dependent fetches from firing while session/profile is unknown.
  if (boot.loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 text-gray-600">Loading…</div>
      </div>
    );
  }

  if (!boot.ok) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="border border-gray-200 rounded-2xl p-6">
            <div className="text-lg font-bold text-gray-900">You’re not signed in</div>
            <div className="text-gray-600 mt-2 text-sm">Please log in to continue.</div>
            <div className="mt-4">
              <Link
                href="/login"
                className="inline-flex bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-5 py-2.5 rounded-lg"
              >
                Log in
              </Link>
            </div>
            <div className="mt-3 text-xs text-gray-500">Code: {boot.code}</div>
          </div>
        </div>
      </div>
    );
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await signOut({ redirectUrl: "/login" });
    } finally {
      // Clear client auth state (best-effort) and redirect to UI route.
      setBoot({ loading: false, ok: false, code: "UNAUTHENTICATED" });
      router.push("/login");
      router.refresh();
      setTimeout(() => {
        // Hard fallback: ensure we never "land" on an API JSON response.
        window.location.href = "/login";
      }, 250);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center">
              <img
                src="/images/8fold_site_logo_dashboard.png"
                alt="8Fold"
                className="h-10 w-auto"
              />
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 ml-2">{title}</h1>
          </div>
          <div className="flex items-center gap-3">
            {bellRole ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setBellOpen((s) => !s)}
                  className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-900 font-semibold px-3 py-2 rounded-lg"
                  aria-label="Notifications"
                >
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden>🔔</span>
                    {bellUnread + (extraUnreadCount ?? 0) > 0 ? (
                      <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1 rounded-full bg-8fold-green text-white text-xs font-bold">
                        {bellUnread + (extraUnreadCount ?? 0) > 99 ? "99+" : bellUnread + (extraUnreadCount ?? 0)}
                      </span>
                    ) : null}
                  </span>
                </button>

                {bellOpen ? (
                  <div className="absolute right-0 mt-2 w-[360px] max-w-[90vw] bg-white border border-gray-200 rounded-2xl shadow-lg overflow-hidden z-50">
                    <div className="p-4 flex items-center justify-between border-b border-gray-100">
                      <div className="font-bold text-gray-900">Notifications</div>
                      <button
                        type="button"
                        onClick={() => setBellOpen(false)}
                        className="text-gray-400 hover:text-gray-700 font-bold px-2"
                        aria-label="Close"
                      >
                        ×
                      </button>
                    </div>

                    {bellError ? (
                      <div className="p-4 text-sm text-red-700 bg-red-50 border-b border-red-100">{bellError}</div>
                    ) : null}

                    {bellLoading ? (
                      <div className="p-4 text-sm text-gray-600">Loading…</div>
                    ) : bellNotifications.length === 0 ? (
                      <div className="p-4 text-sm text-gray-600">No notifications.</div>
                    ) : (
                      <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-100">
                        {bellNotifications.map((n) => {
                          const unread = (n as any)?.readAt == null;
                          return (
                            <button
                              key={n.id}
                              className="w-full text-left p-4 hover:bg-gray-50"
                              onClick={async () => {
                                if (unread) {
                                  await markBellRead([n.id]);
                                  await loadBell();
                                }
                                setBellOpen(false);
                              }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="font-semibold text-gray-900 truncate">
                                    {unread ? "• " : ""}{n.title}
                                  </div>
                                  {n.body ? <div className="text-sm text-gray-600 mt-1 whitespace-pre-wrap break-words">{n.body}</div> : null}
                                  <div className="text-xs text-gray-500 mt-2">{new Date(n.createdAt).toLocaleString()}</div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
            {boot.superuser ? (
              <Link
                href="/app/switch"
                className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-900 font-semibold px-4 py-2 rounded-lg"
              >
                Switch dashboard
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => void logout()}
              disabled={loggingOut}
              className="bg-gray-100 hover:bg-gray-200 disabled:bg-gray-100 disabled:opacity-60 text-gray-900 font-semibold px-4 py-2 rounded-lg"
            >
              {loggingOut ? "Logging out…" : "Log out"}
            </button>
          </div>
        </div>

        {navMode === "none" ? (
          <section className="mt-6">
            <div className="border border-gray-200 rounded-2xl p-6 shadow-sm">{children}</div>
          </section>
        ) : (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
            <aside className="lg:col-span-1">
              <nav className="border border-gray-200 rounded-2xl p-3">
                {items.map((it) => {
                  const active = path === it.href || path.startsWith(it.href + "/");
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      className={
                        "flex items-center justify-between gap-3 px-3 py-2 rounded-lg font-medium " +
                        (active
                          ? "bg-8fold-green text-white"
                          : "text-gray-700 hover:bg-gray-100")
                      }
                    >
                      <span className="min-w-0 truncate">{it.label}</span>
                      {it.badge ? (
                        it.badge.kind === "dot" ? (
                          <span
                            className={"inline-flex h-2.5 w-2.5 rounded-full " + (active ? "bg-white" : "bg-red-600")}
                            aria-label="Unread"
                          />
                        ) : it.badge.value > 0 ? (
                          <span
                            className={
                              "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-bold " +
                              (active ? "bg-white text-8fold-green" : "bg-red-600 text-white")
                            }
                            aria-label="Unread count"
                          >
                            {it.badge.value > 99 ? "99+" : it.badge.value}
                          </span>
                        ) : null
                      ) : null}
                    </Link>
                  );
                })}
              </nav>
            </aside>

            <section className="lg:col-span-4">
              <div className="border border-gray-200 rounded-2xl p-6 shadow-sm">{children}</div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

