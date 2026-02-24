/**
 * Clerk production auth helper for programmatic token acquisition.
 * Used by financialLifecycleTest and other E2E scripts.
 *
 * Requires: CLERK_SECRET_KEY, FIN_JOB_POSTER_EMAIL, FIN_ROUTER_EMAIL, FIN_CONTRACTOR_EMAIL
 *
 * Behavior:
 * 1. Look up user in Clerk by email (create if missing via Backend API)
 * 2. Get active session for user
 * 3. Mint session token usable as Authorization: Bearer <token>
 *
 * Uses Clerk Backend REST API directly (no Next.js context required).
 */

export type ClerkTokenResult = {
  token: string;
  userId: string; // Clerk user ID (user_xxx)
  internalUserId?: string; // Internal User.id if mapped
};

function mustEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}

const CLERK_BACKEND = "https://api.clerk.com/v1";

async function clerkFetch(path: string, opts: RequestInit = {}) {
  const secretKey = mustEnv("CLERK_SECRET_KEY");
  const res = await fetch(`${CLERK_BACKEND}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...opts.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clerk API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Get or create Clerk user by email, then obtain a Bearer token for API calls.
 * User must have signed in at least once (have an active session).
 */
export async function getBearerTokenForEmail(email: string): Promise<ClerkTokenResult> {
  const emailTrim = String(email ?? "").trim().toLowerCase();
  if (!emailTrim) throw new Error("email is required");

  // 1. Find user by email (Clerk API returns array of users)
  const listRes = (await clerkFetch(`/users?query=${encodeURIComponent(emailTrim)}&limit=10`)) as
    | { id: string; email_addresses?: { email_address: string }[] }[]
    | { data?: { id: string; email_addresses?: { email_address: string }[] }[] };
  const arr = Array.isArray(listRes) ? listRes : listRes.data ?? [];
  const match = arr.find((u: any) =>
    u.email_addresses?.some((e: any) => String(e.email_address ?? "").toLowerCase() === emailTrim)
  );
  let user = match ?? arr[0] ?? null;

  if (!user) {
    try {
      const createRes = (await clerkFetch("/users", {
        method: "POST",
        body: JSON.stringify({
          email_address: [emailTrim],
          skip_password_checks: true,
          skip_password_requirement: true,
        }),
      })) as { id?: string };
      user = { id: createRes.id ?? "" };
      console.log(`[clerkProdAuth] Created Clerk user for ${emailTrim}: ${user.id}`);
    } catch (e: any) {
      if (String(e?.message ?? "").includes("form_identifier_exists")) {
        throw new Error(`Clerk user exists for ${emailTrim} but could not be found by query. Try signing in once.`);
      }
      throw e;
    }
  } else {
    console.log(`[clerkProdAuth] Found Clerk user for ${emailTrim}: ${user.id}`);
  }

  const clerkUserId = String(user.id ?? "").trim();
  if (!clerkUserId) throw new Error("Clerk user id missing");

  // 2. Get active sessions (GET /sessions?user_id=...&status=active)
  const sessionsRes = (await clerkFetch(
    `/sessions?user_id=${encodeURIComponent(clerkUserId)}&status=active&limit=1`
  )) as { data?: { id: string }[] };
  const session = sessionsRes.data?.[0] ?? null;

  if (!session) {
    throw new Error(
      `Clerk user ${clerkUserId} (${emailTrim}) has no active session. ` +
        `FIN_* test users must sign in at least once via https://app.8fold.app before running the lifecycle test.`
    );
  }

  // 3. Get session token (POST /sessions/{id}/tokens/{template})
  const template = process.env.CLERK_JWT_TEMPLATE ?? "default";
  const tokenRes = (await clerkFetch(`/sessions/${session.id}/tokens/${template}`, {
    method: "POST",
  })) as { jwt?: string; token?: string };
  const jwt = String(tokenRes?.jwt ?? tokenRes?.token ?? "").trim();
  if (!jwt) throw new Error(`No JWT for session ${session.id}. Check Clerk Dashboard has "${template}" JWT template.`);

  return { token: jwt, userId: clerkUserId };
}
