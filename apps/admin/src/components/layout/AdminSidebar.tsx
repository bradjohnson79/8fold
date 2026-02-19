"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import styles from "./AdminSidebar.module.css";

type NavItem = {
  label: string;
  href: string;
  match?: "exact" | "prefix";
  badgeKey?: "financialIntegrity";
};

const NAV: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Command Center",
    items: [{ label: "Overview", href: "/", match: "exact" }],
  },
  {
    title: "Operations",
    items: [
      { label: "Jobs", href: "/jobs", match: "prefix" },
      { label: "Contractors", href: "/contractors", match: "prefix" },
      { label: "Routers", href: "/routers", match: "prefix" },
      { label: "Payouts", href: "/payouts", match: "prefix" },
      { label: "Disputes", href: "/disputes", match: "prefix" },
      { label: "Support", href: "/support", match: "prefix" },
    ],
  },
  {
    title: "Financial",
    items: [
      { label: "Overview", href: "/financial", match: "exact" },
      { label: "Escrow", href: "/financial/escrow", match: "prefix" },
      { label: "Ledger", href: "/financial/ledger", match: "prefix" },
      { label: "Payout Engine", href: "/financial/payouts", match: "prefix" },
      { label: "Stripe Reconciliation", href: "/financial/reconciliation", match: "prefix" },
      { label: "Incentives", href: "/financial/incentives", match: "prefix" },
      { label: "Integrity Monitor", href: "/financial/integrity", match: "prefix", badgeKey: "financialIntegrity" },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { label: "Metrics", href: "/metrics", match: "prefix" },
      { label: "Settings", href: "/settings", match: "prefix" },
    ],
  },
];

function isActive(pathname: string, href: string, match: NavItem["match"]): boolean {
  const m = match ?? "prefix";
  if (m === "exact") return pathname === href;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const pathname = usePathname() || "/";
  const [integrityCount, setIntegrityCount] = useState<number | null>(null);

  const badgeByKey = useMemo(() => {
    return {
      financialIntegrity: integrityCount,
    } as const;
  }, [integrityCount]);

  useEffect(() => {
    let cancelled = false;

    // Sidebar is a client component; we fetch the count for a live badge.
    // Endpoint is still server-authenticated (admin_session cookie), so this doesn't weaken security.
    async function run() {
      try {
        const resp = await fetch("/api/admin/financial/integrity?take=500&includeViolations=0", { cache: "no-store" });
        const json = (await resp.json().catch(() => null)) as any;
        const count = Number(json?.data?.summary?.violationCount ?? 0);
        if (cancelled) return;
        setIntegrityCount(Number.isFinite(count) ? count : 0);
      } catch {
        if (cancelled) return;
        setIntegrityCount(null);
      }
    }

    void run();
    const t = setInterval(run, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <div>
      <div className={styles.header}>
        <Link className={styles.brand} href="/" onClick={onNavigate}>
          <span className={styles.mark} aria-hidden="true">
            8
          </span>
          <span className={styles.brandText}>
            8Fold
            <span className={styles.brandSub}>Admin</span>
          </span>
        </Link>
      </div>

      <nav className={styles.nav} aria-label="Admin navigation">
        {NAV.map((section) => (
          <div key={section.title}>
            <div className={styles.sectionTitle}>{section.title}</div>
            <div className={styles.links}>
              {section.items.map((item) => {
                const active = isActive(pathname, item.href, item.match);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={`${styles.link} ${active ? styles.active : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <span>{item.label}</span>
                    {item.badgeKey ? (
                      badgeByKey[item.badgeKey] != null ? (
                        badgeByKey[item.badgeKey]! > 0 ? (
                          <span className={`${styles.badge} ${styles.badgeDanger}`} title="Violations requiring review">
                            {badgeByKey[item.badgeKey]! > 99 ? "99+" : String(badgeByKey[item.badgeKey])}
                          </span>
                        ) : (
                          <span className={styles.badge} title="No violations detected">
                            0
                          </span>
                        )
                      ) : null
                    ) : null}
                    {active ? <span className={styles.activeDot} aria-hidden="true" /> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={styles.footer}>
        <div className={styles.envPill} title="Environment">
          Local
        </div>
        <div className={styles.hint}>Admin Command Center shell restored (layout ownership + navigation hierarchy).</div>
      </div>
    </div>
  );
}

