import { apiFetch } from "@/server/api/apiClient";
import { requireApiToken } from "@/server/auth/requireSession";

/**
 * Server-side loader for the same upstream payload that `/api/app/me` proxies.
 * Intended for SSR route guards (redirect decisions).
 */
export async function loadServerMePayload(): Promise<any> {
  const token = await requireApiToken();
  const resp = await apiFetch({
    path: "/api/me",
    method: "GET",
    sessionToken: token,
    timeoutMs: process.env.NODE_ENV !== "production" ? 2000 : 1200,
  });
  const json = await resp.json().catch(() => null);
  if (!resp.ok) {
    const err = new Error(String(json?.error?.message ?? json?.error ?? "Unauthorized"));
    (err as any).status = resp.status;
    (err as any).code = String(json?.error?.code ?? json?.code ?? "");
    throw err;
  }
  return json;
}

