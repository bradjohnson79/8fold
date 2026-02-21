import { expect, test } from "@playwright/test";

/**
 * Real-flow smoke for P&M.
 *
 * This test is intentionally gated behind PM_E2E_ENABLE_REAL because it requires:
 * - a signed-in Job Poster + Contractor context
 * - an existing IN_PROGRESS job fixture
 * - Stripe test configuration
 */
test.describe("P&M basic flow", () => {
  test.skip(process.env.PM_E2E_ENABLE_REAL !== "1", "Set PM_E2E_ENABLE_REAL=1 to run real P&M flow.");

  test("poster can open materials page and create PI idempotently", async ({ page, baseURL }) => {
    const jobId = process.env.PM_E2E_JOB_ID;
    test.skip(!jobId, "Set PM_E2E_JOB_ID");

    await page.goto(`${baseURL}/app/job-poster/jobs/${encodeURIComponent(String(jobId))}/materials`);
    await expect(page.getByRole("heading", { name: /parts & materials/i })).toBeVisible();

    // If SUBMITTED exists, approve it first.
    const approveBtn = page.getByRole("button", { name: /^approve$/i }).first();
    if (await approveBtn.isVisible().catch(() => false)) {
      await approveBtn.click();
      await page.waitForLoadState("networkidle");
    }

    const payBtn = page.getByRole("button", { name: /pay p&m quote/i }).first();
    await expect(payBtn).toBeVisible();

    // Double-click guard: second click should not create a second PI while loading.
    await payBtn.click();
    await expect(payBtn).toBeDisabled();
  });
});
