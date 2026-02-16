import { apiFetch } from "@/server/api/apiClient";
import { SESSION_COOKIE_NAME } from "./session";

function parseCookieHeader(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    out[k] = rest.join("=") ?? "";
  }
  return out;
}

export function getSidFromRequest(req: Request): string | null {
  const cookies = parseCookieHeader(req.headers.get("cookie"));
  const sidRaw = cookies[SESSION_COOKIE_NAME] ?? "";
  let sid = "";
  try {
    sid = sidRaw ? decodeURIComponent(sidRaw) : "";
  } catch (err) {
    sid = "";
  }
  return sid || null;
}

export type Session = {
  userId: string;
  email: string | null;
  role: string;
};

async function loadSessionBySid(sid: string, req?: Request): Promise<Session> {
  const token = String(sid ?? "").trim();
  if (!token) throw Object.assign(new Error("Unauthorized"), { status: 401 });

  // Delegate to apps/api (DB-authoritative). This keeps apps/web DB-free.
  const resp = await apiFetch({ path: "/api/me", method: "GET", sessionToken: token, request: req });
  const json = (await resp.json().catch(() => null)) as any;
  if (!resp.ok || !json?.user) {
    const msg = typeof json?.error === "string" ? json.error : "Unauthorized";
    throw Object.assign(new Error(msg), { status: resp.status || 401 });
  }

  const u = json.user as any;
  return {
    userId: String(u.userId ?? u.id ?? ""),
    email: u.email ?? null,
    role: String(u.role ?? ""),
  };
}

export async function requireSession(req: Request): Promise<Session> {
  const sid = getSidFromRequest(req);
  if (!sid) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }
  // Forward cookies to apps/api for any downstream checks (proxy safety).
  return await loadSessionBySid(sid, req);
}

export async function requireSessionBySid(sid: string): Promise<Session> {
  return await loadSessionBySid(String(sid ?? ""));
}

