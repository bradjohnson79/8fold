import { getValidatedApiOrigin } from "./env";
import { getAdminAuthHeader } from "./adminAuth";
import { fetchWithAdminTimeout } from "./upstreamFetch";

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error?: string | { code?: string; message?: string }; message?: string };

function extractErrorMessage(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const source = input as Record<string, unknown>;
  if (typeof source.message === "string" && source.message.trim()) return source.message.trim();
  if (typeof source.error === "string" && source.error.trim()) return source.error.trim();
  if (source.error && typeof source.error === "object") {
    const nested = source.error as Record<string, unknown>;
    if (typeof nested.message === "string" && nested.message.trim()) return nested.message.trim();
    if (typeof nested.code === "string" && nested.code.trim()) return nested.code.trim();
  }
  return null;
}

export async function adminApiFetch<T>(
  path: string,
  init?: RequestInit & { next?: { revalidate?: number } },
): Promise<T> {
  const apiOrigin = getValidatedApiOrigin();
  const url = `${apiOrigin}${path.startsWith("/") ? "" : "/"}${path}`;
  const authorization = await getAdminAuthHeader();

  let resp: Response;
  try {
    resp = await fetchWithAdminTimeout(url, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        authorization,
        "content-type": (init?.headers as any)?.["content-type"] ?? "application/json",
      },
      cache: "no-store",
    });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 502;
    const message = String(err?.message ?? "Upstream request failed.");
    throw Object.assign(new Error(message), { status });
  }

  const json = (await resp.json().catch(() => null)) as (ApiOk<T> & ApiErr) | null;
  if (!resp.ok || !json) {
    const msg = extractErrorMessage(json) ?? `Upstream error (${resp.status})`;
    throw Object.assign(new Error(msg), { status: resp.status });
  }
  if ((json as any).ok === false) {
    const msg = extractErrorMessage(json) ?? "Upstream error";
    throw Object.assign(new Error(msg), { status: resp.status });
  }
  // apps/api admin routes consistently wrap under { ok: true, data: ... }
  return (json as any).data as T;
}
