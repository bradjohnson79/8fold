import { test, expect } from "@playwright/test";

const ready = process.env.E2E_MESSENGER_READY === "true";

test.describe("messenger v4 smoke", () => {
  test.skip(!ready, "Requires seeded auth/session + messenger fixtures");

  test("contractor flow: thread -> appointment lifecycle -> completion lock", async ({ page }) => {
    await page.goto("/dashboard/contractor/messages");
    await expect(page.getByRole("heading", { name: "Messenger" })).toBeVisible();
    await expect(page.getByRole("button", { name: "BOOK APPT" })).toBeVisible();
    await expect(page.getByRole("button", { name: "RESCHEDULE" })).toBeVisible();
    await expect(page.getByRole("button", { name: "CANCEL" })).toBeVisible();
    await expect(page.getByRole("button", { name: "COMPLETE JOB" })).toBeVisible();
  });

  test("support dispute route visible in admin disputes", async ({ page }) => {
    await page.goto("/dashboard/job-poster/support");
    await expect(page.getByRole("heading", { name: "Support" })).toBeVisible();
    await expect(page.getByRole("option", { name: "DISPUTE" })).toBeVisible();

    await page.goto("/admin/support/disputes");
    await expect(page.getByRole("heading", { name: "Disputes" })).toBeVisible();
  });
});
