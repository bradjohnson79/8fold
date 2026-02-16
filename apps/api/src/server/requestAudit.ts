export type RequestAuditCtx = {
  method: string;
  pathname: string;
  userId: string | null;
};

function auditEnabled(): boolean {
  return String(process.env.DB_AUDIT_LOG ?? "").trim() === "1";
}

export function requestAudit(req: Request, userId?: string | null): RequestAuditCtx {
  const method = String((req as any)?.method ?? "GET");
  const pathname = (() => {
    try {
      return new URL(req.url).pathname;
    } catch {
      return String((req as any)?.url ?? "");
    }
  })();
  const uid = userId ?? null;

  if (auditEnabled()) {
    // eslint-disable-next-line no-console
    console.info("[REQ_AUDIT]", JSON.stringify({ method, pathname, userId: uid }));
  }

  return { method, pathname, userId: uid };
}

