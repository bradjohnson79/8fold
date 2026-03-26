"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { DashboardBreadcrumb } from "@/components/dashboard/DashboardBreadcrumb";
import { routerApiFetch } from "@/lib/routerApi";

type Item = { href: string; label: string };
type Badge = { kind: "dot" } | { kind: "count"; value: number };
type ItemWithBadge = Item & { badge?: Badge };

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
  const path = usePathname();
  const { getToken } = useAuth();
  const hasExtraUnread = Boolean(extraUnreadCount && extraUnreadCount > 0);
  const [boot, setBoot] = useState<
    | { loading: true }
    | { loading: false; ok: true; superuser: boolean }
    | { loading: false; ok: false; code: string }
  >({ loading: true });

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

          const isRouter = path.startsWith("/dashboard/router") || path.startsWith("/app/router");
          const bootPath = path.startsWith("/dashboard/job-poster") ? "/api/web/v4/job-poster/me" : "/api/web/v4/readiness";
          const resp = isRouter
            ? await routerApiFetch(bootPath, getToken)
            : await fetch(bootPath, { cache: "no-store", credentials: "include" });
          const json = (await resp.json().catch(() => null)) as any;
          if (cancelled) return;

          const code = extractAuthCode(json);
          const isPendingAuth =
            resp.status === 401 && (code === "AUTH_TOKEN_PENDING" || code === "AUTH_TOKEN_TIMEOUT");

          if (isPendingAuth) {
            setBoot({ loading: true });
            continue;
          }

          // Only 401 = unauthenticated. 500/network/other = keep user in app (Clerk let them through).
          if (resp.status === 401) {
            setBoot({ loading: false, ok: false, code });
            return;
          }
          if (resp.ok && json?.ok === true) {
            setBoot({ loading: false, ok: true, superuser: Boolean(json?.superuser) });
            return;
          }
          // Non-401 error (500, timeout, etc.): treat as authenticated, show app with sync banner.
          setBoot({ loading: false, ok: true, superuser: false });
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
            {hasExtraUnread ? (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                Support updates available
              </span>
            ) : null}
            {boot.superuser ? (
              <Link
                href="/app/switch"
                className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-900 font-semibold px-4 py-2 rounded-lg"
              >
                Switch dashboard
              </Link>
            ) : null}
          </div>
        </div>

        {navMode === "none" ? (
          <section className="mt-6">
            <DashboardBreadcrumb items={items} />
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
              <DashboardBreadcrumb items={items} />
              <div className="border border-gray-200 rounded-2xl p-6 shadow-sm">{children}</div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
