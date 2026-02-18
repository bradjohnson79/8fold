let adminReadyPromise: Promise<void> | null = null;

async function ensureAdminReady(): Promise<void> {
  if (adminReadyPromise) return await adminReadyPromise;
  adminReadyPromise = (async () => {
    const resp = await fetch("/api/admin/me", { credentials: "include", cache: "no-store" as any });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const message = typeof (json as any)?.error === "string" ? (json as any).error : "Unauthorized";
      throw new Error(message);
    }
    if ((json as any)?.ok !== true) {
      throw new Error("Unauthorized");
    }
  })();
  return await adminReadyPromise;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // Prevent premature admin fetch spam (401/403) by confirming admin session once.
  if (path.startsWith("/api/admin/") && path !== "/api/admin/me") {
    await ensureAdminReady();
  }

  const resp = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include",
    cache: "no-store",
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const message = typeof (json as any)?.error === "string" ? (json as any).error : "Request failed";
    throw new Error(message);
  }

  // Standard admin API contract: { ok: true, data: ... }
  if ((json as any)?.ok === true && "data" in (json as any)) {
    return (json as any).data as T;
  }

  return json as T;
}

