import { headers } from "next/headers";
import { ADMIN_SESSION_COOKIE_NAME } from "./adminSession";
import { getValidatedApiOrigin } from "./env";

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error?: string; message?: string };

export async function adminApiFetch<T>(
  path: string,
  init?: RequestInit & { next?: { revalidate?: number } },
): Promise<T> {
  const apiOrigin = getValidatedApiOrigin();
  const url = `${apiOrigin}${path.startsWith("/") ? "" : "/"}${path}`;

  // Presence guard only: RBAC/identity remains centralized in apps/api.
  // Forward incoming cookies so apps/api can validate admin_session.
  const cookieHeader = (await headers()).get("cookie") ?? "";
  const hasAdminCookie = cookieHeader.includes(`${ADMIN_SESSION_COOKIE_NAME}=`);
  if (!hasAdminCookie) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }

  const resp = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      cookie: cookieHeader,
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

