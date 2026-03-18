/**
 * LGS client fetch helper (apps/lgs).
 *
 * Isolation boundary: callers should hit `apps/lgs` proxy routes under `/api/lgs/*`,
 * which forward to `apps/api`. This package must not speak to DB, jobs, ledger, or Stripe.
 */
export async function lgsFetch<T>(
  path: string,
  opts?: RequestInit & { method?: "GET" | "POST" | "PATCH" }
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts?.headers },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: json.error ?? res.statusText };
  return json;
}
