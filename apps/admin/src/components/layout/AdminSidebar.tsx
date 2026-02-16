"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./AdminSidebar.module.css";

type NavItem = {
  label: string;
  href: string;
  match?: "exact" | "prefix";
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

