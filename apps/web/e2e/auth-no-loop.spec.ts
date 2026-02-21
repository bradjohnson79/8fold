import { expect, test } from "@playwright/test";

const CLERK_STORAGE_STATE = String(process.env.E2E_CLERK_STORAGE_STATE ?? "").trim();

test.describe("auth no-loop stability", () => {
  test("unauthenticated protected route redirects to sign-in", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/app`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/login|\/sign-in/i);
  });

  test("authenticated user stays on protected dashboard after refreshes/new tab", async ({ browser, baseURL }) => {
    test.skip(
      !CLERK_STORAGE_STATE,
      "TODO: provide E2E_CLERK_STORAGE_STATE with Clerk-authenticated storage state.",
    );

    const context = await browser.newContext({ storageState: CLERK_STORAGE_STATE });
    const page = await context.newPage();

    await page.goto(`${baseURL}/app`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await expect(page).not.toHaveURL(/\/login|\/sign-in/i);

    for (let i = 0; i < 10; i += 1) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");
      await expect(page).not.toHaveURL(/\/login|\/sign-in/i);
    }

    const secondTab = await context.newPage();
    await secondTab.goto(`${baseURL}/app`, { waitUntil: "domcontentloaded" });
    await secondTab.waitForLoadState("networkidle");
    await expect(secondTab).not.toHaveURL(/\/login|\/sign-in/i);

    // Equivalent of logout for deterministic auth-boundary testing.
    await context.clearCookies();
    await page.goto(`${baseURL}/app`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/login|\/sign-in/i);

    await context.close();
  });
});
