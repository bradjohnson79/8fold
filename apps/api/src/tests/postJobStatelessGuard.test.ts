import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readRepoFile(relativePath: string): string {
  const repoRoot = path.resolve(process.cwd(), "..", "..");
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("post-job stateless guard", () => {
  it("prevents draft persistence tokens from re-entering payment-intent flow", () => {
    const routeContent = readRepoFile("apps/api/app/api/job-draft/payment-intent/route.ts");
    const forbiddenTokens = ["jobDraft", "draftJob", "draft_payment_intent_id", "draftId"];
    for (const token of forbiddenTokens) {
      expect(routeContent).not.toContain(token);
    }
  });

  it("prevents browser storage state reuse in post-job page", () => {
    const pageContent = readRepoFile("apps/web/src/app/post-job/page.tsx");
    expect(pageContent).not.toContain("localStorage");
    expect(pageContent).not.toContain("sessionStorage");
  });
});
