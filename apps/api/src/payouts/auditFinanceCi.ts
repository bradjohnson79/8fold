import { runPayoutIntegrityAuditFromDb } from "./payoutIntegrityRunner";
import { buildFinanceAuditNotificationPayload, exitCodeForAudit } from "./auditFinanceCiLogic";

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = "1";
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const take = Number(args.take ?? 500);
  const orphanDays = Number(args.orphanDays ?? 180);
  const maxExamples = Number(args.maxExamples ?? 10);

  const audit = await runPayoutIntegrityAuditFromDb({ take, orphanDays });

  const critical = audit.violations.filter((v: any) => String(v.severity) === "CRITICAL");
  const high = audit.violations.filter((v: any) => String(v.severity) === "HIGH");

  console.log(
    JSON.stringify(
      {
        ok: exitCodeForAudit(audit) === 0,
        window: { take, orphanDays },
        summary: audit.summary,
        counts: { CRITICAL: critical.length, HIGH: high.length },
        criticalExamples: critical.slice(0, Math.max(0, maxExamples)),
      },
      null,
      2,
    ),
  );

  const url = String(process.env.FINANCE_AUDIT_WEBHOOK_URL ?? "").trim();
  if (url) {
    try {
      const payload = buildFinanceAuditNotificationPayload({ audit, window: { take, orphanDays }, maxItems: 10 });
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.error(`finance_audit webhook post failed: HTTP ${res.status}`);
      }
    } catch (e) {
      // Dev-safe: do not fail the audit if notifications fail.
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`finance_audit webhook post failed: ${msg}`);
    }
  }

  const code = exitCodeForAudit(audit);
  if (code !== 0) process.exit(code);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`audit:finance failed: ${msg}`);
  process.exit(1);
});

