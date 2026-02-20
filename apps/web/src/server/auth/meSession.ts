import { apiFetch } from "@/server/api/apiClient";
import { auth } from "@clerk/nextjs/server";

export type Session = {
  userId: string;
  email: string | null;
  role: string;
  walletBalanceCents: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<{ ok: true; value: T } | { ok: false }> {
  if (ms <= 0) return { ok: false };
  let t: ReturnType<typeof setTimeout> | null = null;
  try {
    const out = await Promise.race([
      p.then((value) => ({ ok: true as const, value })),
      new Promise<{ ok: false }>((resolve) => {
        t = setTimeout(() => resolve({ ok: false }), ms);
      }),
    ]);
    return out;
  } finally {
    if (t) clearTimeout(t);
  }
}

export async function requireApiToken(): Promise<string> {
  const { getToken, userId } = await auth();

  // Hard cap: never block server render indefinitely waiting for Clerk.
  // Prod is fixed; dev is configurable but still bounded.
  const maxWaitMsDefault =
    process.env.NODE_ENV !== "production"
      ? clamp(Number(process.env.WEB_AUTH_TOKEN_MAX_WAIT_MS ?? 2500), 200, 5000)
      : 2000;
  const maxWaitMs = maxWaitMsDefault;
  const deadline = Date.now() + maxWaitMs;

  // Clerk can briefly report `userId` while `getToken()` is still null right after login redirect.
  // A short, bounded retry avoids redirect loops / "blank until refresh" behavior.
  const retryDelaysMs = [0, 80, 180, 350, 700] as const; // total ~1.3s worst-case
  let token: string | null = null;
  for (let i = 0; i < retryDelaysMs.length; i++) {
    const remainingBeforeSleep = deadline - Date.now();
    if (remainingBeforeSleep <= 0) break;

    const delay = retryDelaysMs[i]!;
    if (delay) await sleep(Math.min(delay, remainingBeforeSleep));

    const remainingBeforeToken = deadline - Date.now();
    const tok = await withTimeout(getToken(), remainingBeforeToken);
    token = tok.ok ? tok.value : null;
    if (token) break;
  }

  if (!token) {
    // Distinguish "not signed in" from "signed in, token not ready yet" for better redirects.
    const timedOut = Date.now() >= deadline;
    const code = userId ? (timedOut ? "AUTH_TOKEN_TIMEOUT" : "AUTH_TOKEN_PENDING") : "AUTH_MISSING_TOKEN";
    throw Object.assign(new Error("Unauthorized"), { status: 401, code });
  }
  return token;
}

async function requireMeSession(req?: Request): Promise<Session> {
  const start = Date.now();
  const stabilizationBudgetMs = process.env.NODE_ENV !== "production" ? 2500 : 2000;
  const deadline = start + stabilizationBudgetMs;

  const token = await requireApiToken();
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) {
    throw Object.assign(new Error("Unauthorized"), { status: 401, code: "AUTH_SESSION_TIMEOUT" });
  }

  // Delegate to apps/api (DB-authoritative). This keeps apps/web DB-free.
  let resp: Response;
  try {
    resp = await apiFetch({
      path: "/api/me",
      method: "GET",
      sessionToken: token,
      request: req,
      timeoutMs: remainingMs,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Node/undici throws AbortError/DOMException on aborted fetch.
    const aborted =
      (e as any)?.name === "AbortError" ||
      (e as any)?.code === "UND_ERR_ABORTED" ||
      msg.toLowerCase().includes("aborted");
    if (aborted) {
      throw Object.assign(new Error("Unauthorized"), { status: 401, code: "AUTH_SESSION_TIMEOUT" });
    }
    throw e;
  }
  const json = (await resp.json().catch(() => null)) as any;
  if (!resp.ok || json?.ok !== true) {
    const code = String(json?.error?.code ?? json?.code ?? "");
    const msg = String(json?.error?.message ?? json?.error ?? "Unauthorized");
    const err = new Error(msg);
    (err as any).status = resp.status || 401;
    (err as any).code = code;
    throw err;
  }

  const u = json.data as any;
  const rawRole = String(u.role ?? "").trim();
  const roleAssigned = u?.roleAssigned !== false && rawRole.length > 0;
  return {
    userId: String(u.id ?? ""),
    email: u.email ?? null,
    role: roleAssigned ? rawRole : "USER_ROLE_NOT_ASSIGNED",
    walletBalanceCents: Number(u.walletBalanceCents ?? 0),
  };
}

/**
 * Server-components-only session loader.
 *
 * Returns:
 * - null for unauthenticated users
 * - { role: "USER_ROLE_NOT_ASSIGNED", ... } for signed-in Clerk users without internal role
 */
async function loadServerMeSession(): Promise<Session | null> {
  try {
    return await requireMeSession();
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : null;
    const code = typeof (err as any)?.code === "string" ? String((err as any).code) : "";
    if (status === 401) {
      if (process.env.WEB_AUTH_DEBUG_LOG === "true") {
        const msg = (err as Error)?.message ?? String(err);
        console.warn("[auth.session_null]", { code, status, message: msg.slice(0, 200) });
      }
      return null;
    }
    if (code === "USER_ROLE_NOT_ASSIGNED") {
      return { userId: "", email: null, role: "USER_ROLE_NOT_ASSIGNED", walletBalanceCents: 0 };
    }
    throw err;
  }
}

// Backwards-compatible exports (legacy files removed; behavior stays the same).
export { requireMeSession as requireSession, loadServerMeSession as requireServerSession };

