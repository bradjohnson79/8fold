/**
 * Direct-to-API helper for Router Dashboard.
 *
 * Follows the same pattern as Post a Job (apps/web/src/app/post-job/page.tsx):
 *   Clerk getToken() → Bearer header → direct fetch to api.8fold.app
 *
 * No proxy layer involved.
 */

export function getApiOrigin(): string {
  const explicit = String(process.env.NEXT_PUBLIC_API_ORIGIN ?? "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return "http://localhost:3003";
  }
  return "https://api.8fold.app";
}

export function apiUrl(path: string): string {
  return `${getApiOrigin()}${path.startsWith("/") ? "" : "/"}${path}`;
}

export async function routerApiFetch(
  path: string,
  getToken: () => Promise<string | null>,
  init?: RequestInit,
): Promise<Response> {
  const token = await getToken();
  if (!token) {
    throw Object.assign(new Error("Not authenticated. Please sign in again."), {
      code: "AUTH_MISSING_TOKEN",
    });
  }
  return fetch(apiUrl(path), {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}
