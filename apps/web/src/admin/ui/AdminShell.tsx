"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AdminColors, AdminRadii } from "./theme";
import { SecondaryButton, Pill } from "./primitives";

type NavItem = { href: string; label: string };
type Section = { title: string; links: NavItem[] };

const BASE = "/admin";

const SECTIONS: Section[] = [
  {
    title: "Operations",
    links: [
      { label: "Dashboard", href: `${BASE}` },
      { label: "Jobs", href: `${BASE}/jobs` },
      { label: "Job Status", href: `${BASE}/jobs/status` },
      { label: "Routing Activity", href: `${BASE}/router-tools/assignments` },
    ],
  },
  {
    title: "Support",
    links: [{ label: "Support Inbox", href: `${BASE}/support` }],
  },
  {
    title: "System",
    links: [{ label: "Settings", href: `${BASE}/settings` }],
  },
  {
    title: "Users",
    links: [{ label: "User Accounts", href: `${BASE}/users` }],
  },
];

function envLabel() {
  return process.env.NODE_ENV === "production" ? "env: production" : "env: local";
}

function envDetail() {
  return "apps/web";
}

function getSectionForPath(pathname: string, search: string): string | null {
  const pathAndSearch = pathname + (search ? `?${search}` : "");
  for (const s of SECTIONS) {
    for (const link of s.links) {
      const isRoot = link.href === BASE;
      const isActive = isRoot
        ? pathname === BASE || pathname === `${BASE}/`
        : pathAndSearch === link.href ||
          pathname === link.href ||
          pathname.startsWith(`${link.href.replace(/\?.*$/, "")}/`);
      if (isActive) return s.title;
    }
  }
  return null;
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";

  const defaultSection = getSectionForPath(pathname, search) ?? SECTIONS[0]!.title;

  const [openSection, setOpenSection] = useState<string | null>(defaultSection);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const stored = typeof window !== "undefined" ? localStorage.getItem("adminSidebarOpen") : null;
    if (stored && SECTIONS.some((s) => s.title === stored)) {
      setOpenSection(stored);
    }
  }, [mounted]);

  useEffect(() => {
    if (mounted && openSection && typeof window !== "undefined") {
      localStorage.setItem("adminSidebarOpen", openSection);
    }
  }, [openSection, mounted]);

  // Sync open section when route changes (e.g. direct navigation)
  useEffect(() => {
    const section = getSectionForPath(pathname, search);
    if (section && openSection !== section) {
      setOpenSection(section);
    }
  }, [pathname, search]);

  // Keep login surface clean + calm (no nav chrome when signed out).
  if (pathname === `${BASE}/login`) {
    return <div style={{ background: AdminColors.bg, color: AdminColors.text }}>{children}</div>;
  }

  async function signOut() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      window.location.href = `${BASE}/login`;
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: AdminColors.bg, color: AdminColors.text }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "260px 1fr",
          minHeight: "100vh",
        }}
      >
        <aside
          style={{
            borderRight: `1px solid ${AdminColors.divider}`,
            padding: 16,
            position: "sticky",
            top: 0,
            height: "100vh",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 12, color: AdminColors.text }}>
            8Fold Local
            <div style={{ fontSize: 12, color: AdminColors.muted, marginTop: 4 }}>Admin Ops</div>
          </div>

          <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {SECTIONS.map((section) => {
              const isOpen = openSection === section.title;
              const toggle = () => setOpenSection(isOpen ? null : section.title);

              return (
                <div key={section.title}>
                  <button
                    type="button"
                    onClick={toggle}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      border: "none",
                      background: "transparent",
                      color: AdminColors.text,
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: "pointer",
                      borderRadius: AdminRadii.pill,
                      textAlign: "left",
                    }}
                  >
                    <span style={{ color: AdminColors.muted }}>{section.title}</span>
                    <span
                      style={{
                        display: "inline-block",
                        transition: "transform 0.2s ease",
                        transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                        color: AdminColors.muted,
                        fontSize: 10,
                      }}
                    >
                      ▶
                    </span>
                  </button>
                  <div
                    style={{
                      overflow: "hidden",
                      maxHeight: isOpen ? 400 : 0,
                      opacity: isOpen ? 1 : 0,
                      transition: "max-height 0.25s ease, opacity 0.2s ease",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        paddingLeft: 4,
                        paddingTop: 4,
                        paddingBottom: 8,
                      }}
                    >
                      {section.links.map((it) => {
                        const pathAndSearch = pathname + (search ? `?${search}` : "");
                        const isRoot = it.href === BASE;
                        const active = isRoot
                          ? pathname === BASE || pathname === `${BASE}/`
                          : pathAndSearch === it.href ||
                            pathname === it.href ||
                            pathname.startsWith(`${it.href.replace(/\?.*$/, "")}/`);

                        return (
                          <Link
                            key={it.href}
                            href={it.href}
                            style={{
                              textDecoration: "none",
                              color: AdminColors.text,
                              background: active ? AdminColors.greenSoft : "transparent",
                              border: `1px solid ${active ? AdminColors.greenBorder : "transparent"}`,
                              padding: "10px 12px",
                              borderRadius: AdminRadii.pill,
                              fontWeight: active ? 900 : 800,
                              position: "relative",
                            }}
                          >
                            {active ? (
                              <span
                                style={{
                                  position: "absolute",
                                  left: 10,
                                  top: "50%",
                                  transform: "translateY(-50%)",
                                  width: 6,
                                  height: 6,
                                  background: AdminColors.green,
                                  borderRadius: 999,
                                }}
                              />
                            ) : null}
                            <span style={{ paddingLeft: active ? 10 : 0 }}>{it.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </nav>

          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
              <Pill label={envLabel()} tone="neutral" />
              <span style={{ fontSize: 11, color: AdminColors.muted }}>{envDetail()}</span>
            </div>
            <SecondaryButton onClick={() => void signOut()}>Sign out</SecondaryButton>
          </div>
        </aside>

        <div>{children}</div>
      </div>
    </div>
  );
}

