"use client";

import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import styles from "./AdminTopbar.module.css";

function titleForPath(pathname: string): { title: string; subtitle?: string } {
  const p = pathname || "/";
  if (p === "/") return { title: "Overview", subtitle: "Command Center" };

  if (p === "/jobs") return { title: "Jobs", subtitle: "Search + controls" };
  if (p.startsWith("/jobs/")) return { title: "Jobs", subtitle: "Job details / audits" };

  if (p === "/contractors") return { title: "Contractors", subtitle: "Role-filtered user intelligence" };
  if (p === "/routers") return { title: "Routers", subtitle: "Role-filtered user intelligence" };

  if (p === "/users") return { title: "Users", subtitle: "Unified user intelligence" };
  if (p.startsWith("/users/")) return { title: "User", subtitle: "Profile / controls" };

  if (p === "/payouts") return { title: "Payouts", subtitle: "Financial controls" };

  if (p === "/disputes") return { title: "Disputes" };
  if (p === "/support") return { title: "Support" };
  if (p === "/metrics") return { title: "Metrics" };
  if (p === "/settings") return { title: "Settings" };

  return { title: "Admin" };
}

export function AdminTopbar({
  adminEmail,
  onOpenSidebar,
  menuButtonClassName,
}: {
  adminEmail: string | null;
  onOpenSidebar?: () => void;
  menuButtonClassName?: string;
}) {
  const pathname = usePathname() || "/";
  const t = titleForPath(pathname);

  return (
    <>
      <div className={styles.left}>
        <button
          type="button"
          onClick={onOpenSidebar}
          className={menuButtonClassName}
          aria-label="Open navigation"
        >
          ☰
        </button>
        <div className={styles.titleBlock}>
          <div className={styles.title}>{t.title}</div>
          {t.subtitle ? <div className={styles.subtle}>{t.subtitle}</div> : null}
        </div>
      </div>

      <div className={styles.right}>
        <span className={styles.role} title="Role">
          ADMIN
        </span>
        <span className={styles.email} title={adminEmail ?? undefined}>
          {adminEmail ?? "—"}
        </span>
        <LogoutButton />
      </div>
    </>
  );
}

