import { cookies } from "next/headers";

export const ADMIN_SESSION_COOKIE_NAME = "admin_session";

function cookieValueFromHeader(cookieHeader: string | null, name: string): string {
  const raw = cookieHeader ?? "";
  if (!raw) return "";
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key !== name) continue;
    const value = part.slice(idx + 1).trim();
    try {
      return value ? decodeURIComponent(value) : "";
    } catch {
      return value;
    }
  }
  return "";
}

export function getAdminSessionTokenFromRequest(req: Request): string | null {
  const token = cookieValueFromHeader(req.headers.get("cookie"), ADMIN_SESSION_COOKIE_NAME).trim();
  return token || null;
}

async function getAdminSessionTokenFromServerContext(): Promise<string | null> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE_NAME)?.value?.trim() ?? "";
  return token || null;
}

export async function getAdminAuthHeader(req?: Request): Promise<string> {
  const token = req ? getAdminSessionTokenFromRequest(req) : await getAdminSessionTokenFromServerContext();
  if (!token) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  return `Bearer ${token}`;
}
