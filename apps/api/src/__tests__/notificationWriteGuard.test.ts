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

describe("notification write guard", () => {
  test("v4_notifications writes are centralized in notification service", () => {
    const apiRoot = process.cwd();
    const thisFile = path.resolve(__filename);
    const sources = [...walkFiles(path.join(apiRoot, "src")), ...walkFiles(path.join(apiRoot, "app"))].filter(
      (file) => path.resolve(file) !== thisFile,
    );

    const allowV4Insert = new Set([
      path.resolve(apiRoot, "src/services/v4/notifications/notificationService.ts"),
    ]);
    const allowLegacyReference = new Set<string>();

    const violations: string[] = [];
    for (const file of sources) {
      const content = fs.readFileSync(file, "utf8");
      if (content.includes("insert(v4Notifications)") && !allowV4Insert.has(path.resolve(file))) {
        violations.push(file);
      }
      if (content.includes("notificationDeliveries") && !allowLegacyReference.has(path.resolve(file))) {
        violations.push(`${file} (legacy notificationDeliveries reference)`);
      }
    }

    expect(violations).toEqual([]);
  });
});
