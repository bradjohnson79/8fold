import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("v4 financial ledger idempotency contract", () => {
  test("financialLedgerService supports dedupe-key idempotent writes", () => {
    const file = path.resolve(process.cwd(), "src/services/v4/financialLedgerService.ts");
    const content = fs.readFileSync(file, "utf8");

    expect(content).toContain("dedupeKey?: string | null");
    expect(content).toContain("where(eq(v4FinancialLedger.dedupeKey, dedupeKey))");
    expect(content).toContain("existsByDedupeKey(");
    expect(content).toContain("v4FinancialLedger.dedupeKey");
  });

  test("financialLedgerService keeps legacy fallback idempotency by job/type/stripeRef", () => {
    const file = path.resolve(process.cwd(), "src/services/v4/financialLedgerService.ts");
    const content = fs.readFileSync(file, "utf8");

    expect(content).toContain("eq(v4FinancialLedger.jobId, jobId)");
    expect(content).toContain("eq(v4FinancialLedger.type, type)");
    expect(content).toContain("eq(v4FinancialLedger.stripeRef, stripeRef)");
  });
});
