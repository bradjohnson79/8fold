"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./AdminSidebar.module.css";

type NavItem = {
  label: string;
  href: string;
  match?: "exact" | "prefix";
  countKey?: "notifications" | "support" | "disputes" | "reviews";
};

type MessageCounts = {
  notifications: number;
  support: number;
  disputes: number;
  reviews: number;
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
      { label: "Job Posters", href: "/job-posters", match: "prefix" },
      { label: "Routers", href: "/routers", match: "prefix" },
      { label: "Payouts", href: "/payouts", match: "prefix" },
    ],
  },
  {
    title: "Messages",
    items: [
      { label: "Notifications", href: "/notifications", match: "prefix", countKey: "notifications" },
      { label: "Support", href: "/support", match: "prefix", countKey: "support" },
      { label: "Disputes", href: "/disputes", match: "prefix", countKey: "disputes" },
      { label: "Reviews", href: "/reviews", match: "prefix", countKey: "reviews" },
    ],
  },
  {
    title: "Finance",
    items: [
      { label: "Stripe Gateway", href: "/finances/stripe", match: "prefix" },
      { label: "Revenue", href: "/finances/revenue", match: "prefix" },
      { label: "Tax Regions", href: "/tax/regions", match: "prefix" },
      { label: "Tax Settings", href: "/tax/settings", match: "prefix" },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { label: "Metrics", href: "/metrics", match: "prefix" },
      { label: "Settings", href: "/settings", match: "prefix" },
    ],
  },
  {
    title: "System",
    items: [
      { label: "System Status", href: "/system/status", match: "prefix" },
      { label: "Data Coverage", href: "/system/data-coverage", match: "prefix" },
      { label: "Frontpage Ticker", href: "/system/frontpage-ticker", match: "prefix" },
      { label: "Admin Users", href: "/admin-users", match: "prefix" },
    ],
  },
  {
    title: "SEO & Marketing",
    items: [
      { label: "SEO Engine", href: "/seo/engine", match: "prefix" },
      { label: "SEO Templates", href: "/seo/templates", match: "prefix" },
      { label: "Sitemap", href: "/seo/sitemap", match: "prefix" },
      { label: "Indexing / Ping", href: "/seo/indexing", match: "prefix" },
      { label: "Analytics", href: "/seo/analytics", match: "prefix" },
      { label: "Advertising", href: "/seo/advertising", match: "prefix" },
      { label: "Distribution", href: "/seo/distribution", match: "prefix" },
      { label: "Keyword Discovery", href: "/seo/keywords", match: "prefix" },
      { label: "Local SEO Generator", href: "/seo/local-seo", match: "prefix" },
    ],
  },
];

function isActive(pathname: string, href: string, match: NavItem["match"]): boolean {
  const m = match ?? "prefix";
  if (m === "exact") return pathname === href;
  if (href === "/finances/revenue" && pathname.startsWith("/finances/") && !pathname.startsWith("/finances/stripe")) {
    return true;
  }
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() || "/";
  const [messageCounts, setMessageCounts] = useState<MessageCounts>({
    notifications: 0,
    support: 0,
    disputes: 0,
    reviews: 0,
  });

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const resp = await fetch("/api/admin/v4/messages/counts", {
          cache: "no-store",
          credentials: "include",
        });
        if (resp.ok) {
          const json = await resp.json().catch(() => null);
          const data = json?.data ?? json;
          if (data && typeof data === "object") {
            setMessageCounts({
              notifications: Number(data.notifications ?? 0) || 0,
              support: Number(data.support ?? 0) || 0,
              disputes: Number(data.disputes ?? 0) || 0,
              reviews: Number(data.reviews ?? 0) || 0,
            });
          }
        }
      } catch {
        // ignore
      }
    };

    void fetchCounts();
    const id = window.setInterval(fetchCounts, 30_000);
    return () => window.clearInterval(id);
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
                const count = item.countKey ? messageCounts[item.countKey] : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={`${styles.link} ${active ? styles.active : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {item.label}
                      {count > 0 && (
                        <span
                          className={styles.badge}
                          aria-label={`${count} items`}
                        >
                          {count > 99 ? "99+" : count}
                        </span>
                      )}
                    </span>
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
