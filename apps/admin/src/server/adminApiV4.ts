import { getValidatedApiOrigin } from "./env";
import { getAdminAuthHeader } from "./adminAuth";
import { fetchWithAdminTimeout } from "./upstreamFetch";

type ApiV4Ok<T> = { ok: true; data: T };
type ApiV4Err = { ok: false; error?: { code?: string; message?: string } | string; message?: string; code?: string };

function toReadableMessage(json: ApiV4Err | null, status: number): string {
  if (!json) return `Upstream error (${status})`;

  const errorValue = (json as any).error;
  if (typeof errorValue === "string" && errorValue.trim()) return errorValue.trim();
  if (errorValue && typeof errorValue === "object") {
    const msg = String((errorValue as any).message ?? "").trim();
    const code = String((errorValue as any).code ?? "").trim();
    if (msg) return msg;
    if (code) return code;
  }

  const message = String((json as any).message ?? "").trim();
  if (message) return message;
  const code = String((json as any).code ?? "").trim();
  if (code) return code;
  return `Upstream error (${status})`;
}

export async function adminApiFetchV4<T>(
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

  const json = (await resp.json().catch(() => null)) as (ApiV4Ok<T> & ApiV4Err) | null;
  if (!resp.ok || !json || (json as any).ok === false) {
    const msg = toReadableMessage(json as any, resp.status);
    throw Object.assign(new Error(msg), { status: resp.status });
  }

  return (json as any).data as T;
}

export const adminApiFetch = adminApiFetchV4;
