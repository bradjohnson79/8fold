import { cookies } from "next/headers";

export const ADMIN_SESSION_COOKIE_NAME = "admin_session";

export async function getAdminSessionToken(): Promise<string | null> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE_NAME)?.value?.trim() ?? "";
  if (!token) return null;
  const segments = token.split(".");
  const isJwtFormat = segments.length === 3 && segments.every((s) => s.length > 0);
  if (!isJwtFormat) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[ADMIN_SESSION_INVALID_FORMAT]");
    }
    return null;
  }
  return token;
}

export async function getAdminAuthHeader(_req?: Request): Promise<string> {
  const token = await getAdminSessionToken();
  if (!token) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  return `Bearer ${token}`;
}
