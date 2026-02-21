import { auth } from "@clerk/nextjs/server";
import { apiFetch } from "@/server/api/apiClient";
import { getClerkIdentity } from "./clerkIdentity";

export type Session = {
  userId: string;
  email: string | null;
  role: string;
  firstName: string | null;
  lastName: string | null;
  superuser: boolean;
  walletBalanceCents: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

const AUTH_DEBUG = process.env.WEB_AUTH_DEBUG_LOG === "true";
function authDebugLog(msg: string, data?: Record<string, unknown>): void {
  if (AUTH_DEBUG) console.warn("[auth.debug]", msg, data ?? {});
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
  const tokenStart = Date.now();
  const { getToken, userId } = await auth();

  // Hard cap: never block server render indefinitely waiting for Clerk.
  // Prod: 10s to avoid premature null when Clerk token issuance is slow after redirect.
  // Dev: configurable but bounded.
  const maxWaitMsDefault =
    process.env.NODE_ENV !== "production"
      ? clamp(Number(process.env.WEB_AUTH_TOKEN_MAX_WAIT_MS ?? 2500), 200, 5000)
      : 10000;
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
    const durationMs = Date.now() - tokenStart;
    authDebugLog("token_acquisition_failed", {
      acquired: false,
      durationMs,
      code: userId ? (Date.now() >= deadline ? "AUTH_TOKEN_TIMEOUT" : "AUTH_TOKEN_PENDING") : "AUTH_MISSING_TOKEN",
    });
    const timedOut = Date.now() >= deadline;
    const code = userId ? (timedOut ? "AUTH_TOKEN_TIMEOUT" : "AUTH_TOKEN_PENDING") : "AUTH_MISSING_TOKEN";
    throw Object.assign(new Error("Unauthorized"), { status: 401, code });
  }
  authDebugLog("token_acquired", { acquired: true, durationMs: Date.now() - tokenStart });
  return token;
}

async function requireMeSession(_req?: Request): Promise<Session> {
  const identity = await getClerkIdentity();
  if (!identity) {
    throw Object.assign(new Error("Unauthorized"), { status: 401, code: "AUTH_MISSING_TOKEN" });
  }

  let role = identity.role;
  let email = identity.email;
  let walletBalanceCents = 0;

  // Best-effort DB role enrichment. Auth remains Clerk-authoritative if this fails.
  try {
    const token = await requireApiToken();
    const resp = await apiFetch({
      path: "/api/me",
      method: "GET",
      sessionToken: token,
      timeoutMs: 1_500,
    });
    const json = (await resp.json().catch(() => null)) as any;
    if (resp.ok && json?.ok === true && json?.data && typeof json.data === "object") {
      const data = json.data as any;
      const dbRole = String(data.role ?? "").trim().toUpperCase();
      if (dbRole) role = dbRole;
      if (!email && typeof data.email === "string") email = data.email;
      walletBalanceCents = Number(data.walletBalanceCents ?? 0) || 0;
    }
  } catch (error) {
    authDebugLog("api_role_enrichment_failed", {
      message: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
    });
  }

  authDebugLog("session_ok", { branch: "clerk_only_identity" });
  return {
    userId: identity.userId,
    email,
    role,
    firstName: identity.firstName,
    lastName: identity.lastName,
    superuser: identity.superuser,
    walletBalanceCents,
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
    if (status === 401) {
      authDebugLog("session_null", {
        branch: "session_null",
        status,
        message: ((err as Error)?.message ?? String(err)).slice(0, 200),
      });
      return null;
    }
    throw err;
  }
}

// Backwards-compatible exports (legacy files removed; behavior stays the same).
export { requireMeSession as requireSession, loadServerMeSession as requireServerSession };

