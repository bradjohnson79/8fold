import { cookies } from "next/headers";
/**
 * apps/admin is DB-free.
 *
 * Admin auth is validated by apps/api using the `admin_session` cookie.
 * This module exists only to share the cookie name + read the token server-side.
 */

export const ADMIN_SESSION_COOKIE_NAME = "admin_session";

export async function getAdminSessionTokenFromCookies(): Promise<string | null> {
  const c = await cookies();
  const token = String(c.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? "").trim();
  return token ? token : null;
}

