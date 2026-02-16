"use client";

import { useMemo, useState } from "react";
import styles from "./AdminLayout.module.css";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopbar } from "./AdminTopbar";

export function AdminLayout({
  adminEmail,
  children,
}: {
  adminEmail: string | null;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const shellStyle = useMemo(() => {
    // These CSS vars only matter on mobile; desktop layout remains fixed (sidebar always visible).
    return {
      ["--sidebarX" as any]: sidebarOpen ? "0%" : "-110%",
      ["--overlayOpacity" as any]: sidebarOpen ? "1" : "0",
      ["--overlayPointer" as any]: sidebarOpen ? "auto" : "none",
    } as React.CSSProperties;
  }, [sidebarOpen]);

  return (
    <div className={styles.shell} style={shellStyle}>
      <div className={styles.overlay} onClick={() => setSidebarOpen(false)} aria-hidden="true" />

      <aside className={styles.sidebar} aria-label="Admin navigation">
        <AdminSidebar onNavigate={() => setSidebarOpen(false)} />
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <AdminTopbar
            adminEmail={adminEmail}
            onOpenSidebar={() => setSidebarOpen(true)}
            menuButtonClassName={styles.mobileMenuButton}
          />
        </header>

        <main className={styles.content}>
          <div className={styles.contentInner}>{children}</div>
        </main>
      </div>
    </div>
  );
}

