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

    // Backend must respect logout: /api/app/me returns 401
    const meResp = await page.request.get(`${baseURL}/api/app/me`, { failOnStatusCode: false });
    expect(meResp.status()).toBe(401);

    await context.close();
  });

  test("cross-tab logout: other tab redirects on refresh after logout in one tab", async ({ browser, baseURL }) => {
    test.skip(
      !CLERK_STORAGE_STATE,
      "TODO: provide E2E_CLERK_STORAGE_STATE with Clerk-authenticated storage state.",
    );

    const context = await browser.newContext({ storageState: CLERK_STORAGE_STATE });
    const tab1 = await context.newPage();
    const tab2 = await context.newPage();

    await tab1.goto(`${baseURL}/app`, { waitUntil: "domcontentloaded" });
    await tab1.waitForLoadState("networkidle");
    await expect(tab1).not.toHaveURL(/\/login|\/sign-in/i);

    await tab2.goto(`${baseURL}/app`, { waitUntil: "domcontentloaded" });
    await tab2.waitForLoadState("networkidle");
    await expect(tab2).not.toHaveURL(/\/login|\/sign-in/i);

    // Logout in tab1 (clicks actual sign out button)
    await tab1.getByRole("button", { name: /log out/i }).click();
    await tab1.waitForLoadState("networkidle");
    await expect(tab1).not.toHaveURL(/\/app/);

    // Tab2: refresh must redirect to login (no zombie session)
    await tab2.reload({ waitUntil: "domcontentloaded" });
    await tab2.waitForLoadState("networkidle");
    await expect(tab2).toHaveURL(/\/login|\/sign-in/i);

    // Backend must respect logout: /api/app/me returns 401
    const meResp = await tab2.request.get(`${baseURL}/api/app/me`, { failOnStatusCode: false });
    expect(meResp.status()).toBe(401);

    await context.close();
  });
});
