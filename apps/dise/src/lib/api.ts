export async function diseFetch<T>(
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
