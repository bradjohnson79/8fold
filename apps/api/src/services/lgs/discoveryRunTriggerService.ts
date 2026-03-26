export function buildInternalAuthHeaders(): HeadersInit {
  const headers: HeadersInit = { "content-type": "application/json" };
  if (process.env.CRON_SECRET) {
    headers.authorization = `Bearer ${process.env.CRON_SECRET}`;
  }
  return headers;
}

export function triggerDiscoveryRun(origin: string, runId: string, reason: string) {
  void fetch(`${origin}/api/internal/lgs/process-discovery-run`, {
    method: "POST",
    headers: buildInternalAuthHeaders(),
    body: JSON.stringify({ run_id: runId }),
  }).catch((error) => {
    console.error("[LGS] Failed to trigger discovery run", { runId, reason, error: String(error) });
  });
}
