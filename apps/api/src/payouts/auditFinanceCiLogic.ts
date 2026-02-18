import type { auditPayoutIntegrity } from "./payoutIntegrityAudit";

export type AuditResult = ReturnType<typeof auditPayoutIntegrity>;

export function exitCodeForAudit(audit: AuditResult): number {
  const critical = audit.violations.filter((v: any) => String(v.severity) === "CRITICAL");
  return critical.length > 0 ? 2 : 0;
}

export function buildFinanceAuditNotificationPayload(input: {
  audit: AuditResult;
  window: { take: number; orphanDays: number };
  maxItems: number;
}) {
  const maxItems = Math.max(1, Math.min(50, Number(input.maxItems ?? 10)));
  const critical = input.audit.violations.filter((v: any) => String(v.severity) === "CRITICAL");
  const high = input.audit.violations.filter((v: any) => String(v.severity) === "HIGH");

  const top = [...critical, ...high].slice(0, maxItems).map((v: any) => ({
    severity: v.severity,
    jobId: v.jobId,
    code: v.type,
    message: v.message,
  }));

  return {
    kind: "finance_audit",
    generatedAt: new Date().toISOString(),
    window: input.window,
    summary: input.audit.summary,
    counts: { CRITICAL: critical.length, HIGH: high.length },
    top,
  };
}

