import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("notification idempotency safeguards", () => {
  test("notification service includes software dedupe fallback when dedupe_key column is absent", () => {
    const file = path.resolve(process.cwd(), "src/services/v4/notifications/notificationService.ts");
    const content = fs.readFileSync(file, "utf8");

    expect(content).toContain("findByMetadataDedupe");
    expect(content).toContain("metadata} ->> '_dedupeKey'");
    expect(content).toContain("_dedupeKey");
    expect(content).toContain("resolvedDedupeKey && !dedupeColumnAvailable");
  });
});

