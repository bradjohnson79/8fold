"use client";

import { usePathname } from "next/navigation";
import { useMeSession } from "@/lib/useMeSession";

const isDev = process.env.NODE_ENV === "development";

/** True when lifecycle debug panel should be visible (admin or dev). */
export function useLifecycleDebug(): boolean {
  const pathname = usePathname();
  const { me } = useMeSession();
  if (isDev) return true;
  // TEMPORARY: Show lifecycle dropdown on Contractor and Job Poster overview for production testing.
  // Remove this block when testing is complete.
  if (pathname === "/dashboard/contractor" || pathname === "/dashboard/job-poster") return true;
  const role = String(me?.role ?? "").toUpperCase();
  const superuser = Boolean(me?.superuser);
  return role === "ADMIN" || role === "SUPER_ADMIN" || superuser;
}
