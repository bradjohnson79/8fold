"use client";

import { useMeSession } from "@/lib/useMeSession";

const isDev = process.env.NODE_ENV === "development";

/** True when lifecycle debug panel should be visible (admin or dev). */
export function useLifecycleDebug(): boolean {
  const { me } = useMeSession();
  if (isDev) return true;
  const role = String(me?.role ?? "").toUpperCase();
  const superuser = Boolean(me?.superuser);
  return role === "ADMIN" || role === "SUPER_ADMIN" || superuser;
}
