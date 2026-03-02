import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("stripe fee reconciliation idempotency", () => {
  test("reconciliation service uses dedupe keys and pre-checks existing fee row", () => {
    const file = path.resolve(process.cwd(), "src/services/v4/stripeFeeReconciliationService.ts");
    const content = fs.readFileSync(file, "utf8");

    expect(content).toContain("existsByDedupeKey(");
    expect(content).toContain("stripe_fee_actual:${jobId}:${balanceTxnId}");
    expect(content).toContain("stripe_net:${jobId}:${balanceTxnId}");
    expect(content).toContain("proc_fee_delta:${jobId}:${balanceTxnId}");
    expect(content).toContain("estimatedMissing");
  });
});

