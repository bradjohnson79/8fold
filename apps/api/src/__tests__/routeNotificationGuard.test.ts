import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(abs));
      continue;
    }
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) out.push(abs);
  }
  return out;
}

describe("route notification guard", () => {
  test("no new direct notification sends are added in app routes", () => {
    const apiRoot = process.cwd();
    const routeFiles = walkFiles(path.join(apiRoot, "app"));

    const allow = new Set(
      [
        "app/api/webhooks/stripe/route.ts",
        "app/api/admin/notifications/send/route.ts",
        "app/api/web/job-poster/jobs/[id]/confirm-completion/route.ts",
        "app/api/web/contractor/jobs/[id]/complete/route.ts",
      ].map((p) => path.resolve(apiRoot, p)),
    );

    const violations: string[] = [];
    for (const file of routeFiles) {
      const content = fs.readFileSync(file, "utf8");
      const hasDirect =
        content.includes("sendNotification(") ||
        content.includes("sendBulkNotifications(") ||
        content.includes("createNotification(") ||
        content.includes("createAdminNotifications(");
      if (hasDirect && !allow.has(path.resolve(file))) {
        violations.push(file);
      }
    }

    expect(violations).toEqual([]);
  });
});

