import { getValidatedApiOrigin } from "./env";
import { ADMIN_SESSION_COOKIE_NAME, getAdminSessionTokenFromCookies } from "./adminSession";

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error?: string; message?: string };

export async function adminApiFetch<T>(
  path: string,
  init?: RequestInit & { next?: { revalidate?: number } },
): Promise<T> {
  const apiOrigin = getValidatedApiOrigin();
  const url = `${apiOrigin}${path.startsWith("/") ? "" : "/"}${path}`;

  const token = await getAdminSessionTokenFromCookies();
  if (!token) throw Object.assign(new Error("Unauthorized"), { status: 401 });

  const resp = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      // Cross-origin server fetch won't include browser cookies automatically; forward explicitly.
      cookie: `${ADMIN_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
      "content-type": (init?.headers as any)?.["content-type"] ?? "application/json",
    },
    cache: "no-store",
  });

  const json = (await resp.json().catch(() => null)) as (ApiOk<T> & ApiErr) | null;
  if (!resp.ok || !json) {
    const msg = (json as any)?.error || (json as any)?.message || `Upstream error (${resp.status})`;
    throw Object.assign(new Error(msg), { status: resp.status });
  }
  if ((json as any).ok === false) {
    const msg = (json as any)?.error || (json as any)?.message || "Upstream error";
    throw Object.assign(new Error(msg), { status: resp.status });
  }
  // apps/api admin routes consistently wrap under { ok: true, data: ... }
  return (json as any).data as T;
}

