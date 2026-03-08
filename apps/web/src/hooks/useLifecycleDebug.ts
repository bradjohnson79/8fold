"use client";

import { usePathname } from "next/navigation";
import { useSession } from "@/lib/useMeSession";

const isDev = process.env.NODE_ENV === "development";

/** True when lifecycle debug panel should be visible (admin or dev). */
export function useLifecycleDebug(): boolean {
  const pathname = usePathname();
  const { me } = useSession();

  // Always enabled in development
  if (isDev) return true;

  // TEMP: allow lifecycle override testing on dashboards
  if (pathname === "/dashboard/contractor" || pathname === "/dashboard/job-poster") {
    return true;
  }

  // Admin override access
  const role = String(me?.role ?? "").toUpperCase();
  const superuser = Boolean(me?.superuser);

  return role === "ADMIN" || role === "SUPER_ADMIN" || superuser;
}