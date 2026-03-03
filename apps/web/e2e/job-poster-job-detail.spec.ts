/**
 * Job Poster Job Detail — verifies clicking a job from My Jobs loads the detail page
 * without 500 errors. Run with: AUDIT_BASE_URL=http://localhost:3006 pnpm exec playwright test e2e/job-poster-job-detail.spec.ts
 */
import { expect, test } from "@playwright/test";

const BASE_URL = process.env.AUDIT_BASE_URL || "http://localhost:3006";
const STATIC_TEST_CODE = "424242";

test.describe("Job Poster Job Detail", () => {
  test("job list loads and job detail page loads without 500", async ({ page }) => {
    // Track network errors
    const failedRequests: { url: string; status: number }[] = [];
    page.on("response", (resp) => {
      const url = resp.url();
      if (url.includes("/api/web/v4/job-poster/jobs/") && resp.status() >= 500) {
        failedRequests.push({ url, status: resp.status() });
      }
    });

    // Navigate to My Jobs (will redirect to login if not authenticated)
    await page.goto(`${BASE_URL}/dashboard/job-poster/jobs`, { waitUntil: "domcontentloaded", timeout: 15_000 });

    // If we hit login, we need auth - skip
    const isLogin = /\/login|\/sign-in/i.test(page.url());
    if (isLogin) {
      test.skip(true, "Not authenticated - sign in as Job Poster first, then re-run");
      return;
    }

    // Wait for job list content
    await page.waitForLoadState("domcontentloaded");
    const listHeading = page.getByRole("heading", { name: /my jobs/i }).first();
    await expect(listHeading).toBeVisible({ timeout: 8_000 });

    // Find first job link (link to /dashboard/job-poster/jobs/[id])
    const jobLinks = page.locator('a[href*="/dashboard/job-poster/jobs/"]').filter({
      hasNot: page.locator('text="Back to My Jobs"'),
    });
    const firstJobLink = jobLinks.first();
    const count = await jobLinks.count();

    if (count === 0) {
      // No jobs - that's ok, we can't test detail. Verify list loaded.
      expect(failedRequests).toHaveLength(0);
      return;
    }

    // Click first job
    const href = await firstJobLink.getAttribute("href");
    await firstJobLink.click();

    // Wait for navigation to detail page
    await page.waitForURL(/\/dashboard\/job-poster\/jobs\/[a-f0-9-]+/, { timeout: 10_000 });
    await page.waitForLoadState("networkidle");

    // Must not show "Job not found" when we clicked a valid job from the list
    const notFound = page.getByText("Job not found");
    const serverError = page.getByText("We couldn't load this job right now");

    await expect(notFound).not.toBeVisible();
    await expect(serverError).not.toBeVisible();

    // Must not have 500 on job detail request
    expect(
      failedRequests.filter((r) => r.url.includes("/jobs/") && !r.url.endsWith("/jobs")),
      "Job detail API must not return 500",
    ).toHaveLength(0);

    // Detail page should show job content (title or description)
    const detailContent = page.locator('[class*="rounded"]').filter({ hasText: /description|trade|status|amount/i });
    await expect(detailContent.first()).toBeVisible({ timeout: 5_000 });
  });
});
