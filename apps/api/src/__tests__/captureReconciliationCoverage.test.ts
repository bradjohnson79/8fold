import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("capture-driven reconciliation coverage", () => {
  test("pm upload receipt route performs reconciliation after capture", () => {
    const file = path.resolve(process.cwd(), "app/api/web/job/[jobId]/pm/upload-receipt/route.ts");
    const content = fs.readFileSync(file, "utf8");

    expect(content).toContain("reconcileStripeFeeForPaymentIntent");
    expect(content).toContain("source: \"capture_route_pm_upload\"");
  });

  test("webhook includes charge.succeeded fallback reconciliation", () => {
    const file = path.resolve(process.cwd(), "app/api/webhooks/stripe/route.ts");
    const content = fs.readFileSync(file, "utf8");

    expect(content).toContain("\"charge.succeeded\"");
    expect(content).toContain("source: \"webhook_charge_succeeded\"");
  });
});

