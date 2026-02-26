import crypto from "node:crypto";

export const ADMIN_V4_SESSION_COOKIE_NAME = "admin_session";
const SESSION_DAYS = 30;

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

export function adminV4SessionTokenFromRequest(req: Request): string | null {
  const token = cookieValueFromHeader(req.headers.get("cookie"), ADMIN_V4_SESSION_COOKIE_NAME);
  const trimmed = String(token ?? "").trim();
  return trimmed || null;
}

export function sessionTokenHash(token: string): string {
  return crypto.createHash("sha256").update(String(token ?? "").trim()).digest("hex");
}

export function newAdminV4SessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function adminV4ExpiresAtFromNow(): Date {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

export function appendSessionCookie(res: Response, token: string, expiresAt: Date): void {
  const secure = process.env.NODE_ENV === "production";
  const parts = [
    `${ADMIN_V4_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
    secure ? "Secure" : null,
  ].filter(Boolean);
  res.headers.append("Set-Cookie", parts.join("; "));
}

export function appendClearSessionCookie(res: Response): void {
  const secure = process.env.NODE_ENV === "production";
  const parts = [
    `${ADMIN_V4_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    secure ? "Secure" : null,
  ].filter(Boolean);
  res.headers.append("Set-Cookie", parts.join("; "));
}
