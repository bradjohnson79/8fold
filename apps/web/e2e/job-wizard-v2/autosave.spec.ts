import { expect, test } from "@playwright/test";
import { E2E_USER, parseVersionFromWizard, resetFixture } from "./helpers";

test.use({ extraHTTPHeaders: { "x-e2e-user": E2E_USER } });

test("autosave sends expectedVersion and idempotent save keeps version", async ({ page, request }) => {
  await resetFixture(request);

  await page.goto("/e2e/job-wizard");
  const titleInput = page.getByPlaceholder("Enter a clear job title");
  await expect(titleInput).toBeVisible();

  const req1Promise = page.waitForRequest((r) =>
    r.url().includes("/api/app/job-poster/drafts-v2/save-field") && r.method() === "POST"
  );
  const res1Promise = page.waitForResponse((r) =>
    r.url().includes("/api/app/job-poster/drafts-v2/save-field") && r.request().method() === "POST"
  );
  await titleInput.fill("Deterministic Job Title");
  await titleInput.blur();
  const req1 = await req1Promise;
  const res1 = await res1Promise;
  const reqBody1 = JSON.parse(req1.postData() ?? "{}");
  const json1 = await res1.json();
  expect(typeof reqBody1.expectedVersion).toBe("number");
  expect(json1.success).toBe(true);
  const versionAfterFirstSave = Number(json1.draft.version);

  const req2Promise = page.waitForRequest((r) =>
    r.url().includes("/api/app/job-poster/drafts-v2/save-field") && r.method() === "POST"
  );
  const res2Promise = page.waitForResponse((r) =>
    r.url().includes("/api/app/job-poster/drafts-v2/save-field") && r.request().method() === "POST"
  );
  await titleInput.fill("Deterministic Job Title");
  await titleInput.blur();
  const req2 = await req2Promise;
  const res2 = await res2Promise;
  const reqBody2 = JSON.parse(req2.postData() ?? "{}");
  const json2 = await res2.json();

  expect(typeof reqBody2.expectedVersion).toBe("number");
  expect(json2.success).toBe(true);
  expect(json2.draft.version).toBe(versionAfterFirstSave);
  expect(await parseVersionFromWizard(page)).toBe(versionAfterFirstSave);
});
