import { expect, test } from "@playwright/test";
import { E2E_USER, resetFixture } from "./helpers";

test.use({ extraHTTPHeaders: { "x-e2e-user": E2E_USER } });

test("version conflict replaces local draft and shows banner", async ({ browser, page, request }) => {
  await resetFixture(request);

  await page.goto("/e2e/job-wizard");
  const page1Title = page.getByPlaceholder("Enter a clear job title");
  await expect(page1Title).toBeVisible();

  const context2 = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    extraHTTPHeaders: { "x-e2e-user": E2E_USER },
  });
  const page2 = await context2.newPage();
  await page2.goto("/e2e/job-wizard");
  const page2Title = page2.getByPlaceholder("Enter a clear job title");
  await expect(page2Title).toBeVisible();

  const save1ResPromise = page.waitForResponse((r) =>
    r.url().includes("/api/app/job-poster/drafts-v2/save-field") && r.request().method() === "POST"
  );
  await page1Title.fill("Primary Tab Title");
  await page1Title.blur();
  const save1Json = await (await save1ResPromise).json();
  expect(save1Json.success).toBe(true);
  const latestVersion = Number(save1Json.draft.version);

  const save2ResPromise = page2.waitForResponse((r) =>
    r.url().includes("/api/app/job-poster/drafts-v2/save-field") && r.request().method() === "POST"
  );
  await page2Title.fill("Secondary Tab Stale Title");
  await page2Title.blur();
  const save2Res = await save2ResPromise;
  const save2Json = await save2Res.json();

  expect(save2Res.status()).toBe(409);
  expect(save2Json.code).toBe("VERSION_CONFLICT");
  expect(Number(save2Json.draft.version)).toBe(latestVersion);
  await expect(page2.getByText("Draft updated in another tab. Synced to latest version.")).toBeVisible();

  await context2.close();
});
