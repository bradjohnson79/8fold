type AuthErrorJson = { ok?: boolean; error?: string; message?: string } | null;

export type AdminAuthResult<T = unknown> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string };

type AdminAuthFetchOptions = {
  redirectOnAuthError?: boolean;
};

function pickErrorMessage(json: AuthErrorJson, status: number): string {
  const raw = String(json?.error ?? json?.message ?? "").trim();
  if (raw) return raw;
  if (status === 401 || status === 403) return "UNAUTHORIZED";
  return "REQUEST_FAILED";
}

export async function adminAuthFetch<T = unknown>(
  path: string,
  init?: RequestInit,
  opts?: AdminAuthFetchOptions,
): Promise<AdminAuthResult<T>> {
  const redirectOnAuthError = opts?.redirectOnAuthError ?? true;
  const resp = await fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "content-type": (init?.headers as Record<string, string> | undefined)?.["content-type"] ?? "application/json",
    },
  });

  const json = (await resp.json().catch(() => null)) as AuthErrorJson;
  if (resp.status === 401 || resp.status === 403) {
    if (redirectOnAuthError) {
      window.location.href = "/login";
    }
    return { ok: false, status: resp.status, error: pickErrorMessage(json, resp.status) };
  }

  if (!resp.ok || json?.ok === false) {
    return { ok: false, status: resp.status, error: pickErrorMessage(json, resp.status) };
  }

  return { ok: true, status: resp.status, data: json as T };
}
