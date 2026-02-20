import fs from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  addStep,
  attachConsoleGuard,
  attachNetworkGuard,
  attachPageErrorGuard,
  collectHomepagePerf,
  createRunRecord,
  failIfCriticalIssues,
  writeRunArtifact,
} from "./helpers/audit";

const AUDIT_ENV = (String(process.env.AUDIT_ENV || "local").toLowerCase() === "production"
  ? "production"
  : "local") as "local" | "production";
const BASE_URL = process.env.AUDIT_BASE_URL || (AUDIT_ENV === "production" ? "https://8fold.app" : "http://localhost:3006");
const STATIC_TEST_CODE = "424242";

async function maybeClick(page: Page, labels: string[]) {
  for (const label of labels) {
    const btn = page.getByRole("button", { name: new RegExp(label, "i") }).first();
    if (await btn.count()) {
      await btn.click();
      return true;
    }
  }
  return false;
}

async function fillAuthEmail(page: Page, email: string) {
  const emailInput = page
    .getByRole("textbox", { name: /email address or username|email/i })
    .first()
    .or(page.locator('input[type="email"]').first());
  await expect(emailInput).toBeVisible({ timeout: 20_000 });
  await emailInput.fill(email);
}

async function fillSignupRequiredFields(page: Page) {
  const usernameInput = page.getByRole("textbox", { name: /username/i }).first();
  if (await usernameInput.isVisible().catch(() => false)) {
    await usernameInput.fill(`e2e_clerk_${Date.now()}`);
  }
  const firstNameInput = page.getByRole("textbox", { name: /first name/i }).first();
  if (await firstNameInput.isVisible().catch(() => false)) {
    await firstNameInput.fill("E2E");
  }
  const lastNameInput = page.getByRole("textbox", { name: /last name/i }).first();
  if (await lastNameInput.isVisible().catch(() => false)) {
    await lastNameInput.fill("Tester");
  }
}

async function continueAuth(page: Page) {
  const clicked = await maybeClick(page, ["continue", "sign in", "submit", "sign up"]);
  if (!clicked) throw new Error("Unable to continue auth flow: Continue/Sign in button not found.");
}

async function waitForOtpUi(page: Page) {
  const otpSingle = page.locator('input[autocomplete="one-time-code"], input[name*="code"], input[id*="code"]').first();
  const otpPart = page.locator('input[inputmode="numeric"]').first();
  await Promise.race([
    otpSingle.waitFor({ state: "visible", timeout: 60_000 }),
    otpPart.waitFor({ state: "visible", timeout: 60_000 }),
  ]).catch(() => {
    throw new Error("OTP UI did not appear after clicking Continue.");
  });
}

async function enterStaticVerificationCode(page: Page, code: string) {
  const otpSingle = page.locator('input[autocomplete="one-time-code"], input[name*="code"], input[id*="code"]').first();
  if (await otpSingle.isVisible().catch(() => false)) {
    await otpSingle.fill(code);
    return;
  }
  const otpParts = page.locator('input[inputmode="numeric"]');
  const partsCount = await otpParts.count();
  if (partsCount >= 6) {
    for (let i = 0; i < 6; i += 1) {
      await otpParts.nth(i).fill(code[i] ?? "");
    }
    return;
  }
  throw new Error("Verification code inputs are not available.");
}

async function waitForAuthenticatedSignal(page: Page) {
  const authUi = page
    .locator('[data-testid*="user"], button[aria-label*="user"], img[alt*="avatar"], [class*="userButton"]')
    .first();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(800);
  if (/\/app(\/|$)|\/onboarding\/role/i.test(page.url())) return;
  if (await authUi.isVisible().catch(() => false)) return;
  if (await page.getByText(/job poster dashboard|router dashboard|contractor dashboard/i).first().isVisible().catch(() => false)) return;
  const resp = await page.request.get(`${BASE_URL}/api/app/me`).catch(() => null);
  if (resp?.ok()) return;
  throw new Error("Authentication did not complete after verification.");
}

function buildTestModeEmail(): string {
  const preferred = process.env.AUDIT_LOGIN_EMAIL?.trim();
  if (preferred) return preferred;
  return "info+clerk_test@aetherx.co";
}

async function ensureJobPosterRole(page: Page) {
  if (!/\/onboarding\/role/i.test(page.url())) return;
  await page.getByRole("radio", { name: /job poster/i }).check();
  await page.getByRole("checkbox", { name: /cannot be changed later/i }).check();
  await maybeClick(page, ["continue"]);
}

async function fetchJobs(page: Page) {
  const resp = await page.request.get(`${BASE_URL}/api/app/job-poster/jobs`);
  const json = (await resp.json().catch(() => ({}))) as any;
  const jobs = Array.isArray(json?.jobs) ? json.jobs : [];
  return { resp, jobs };
}

function statusLabel(ok: boolean) {
  return ok ? "PASS" : "FAIL";
}

test("full frontend audit", async ({ page, context }) => {
  let homepageOk = false;
  let authOk = false;
  let dashboardOk = false;
  let jobCreationOk = false;
  let cleanupOk = false;

  const run = createRunRecord(AUDIT_ENV, BASE_URL);
  attachConsoleGuard(page, { env: AUDIT_ENV, issues: run.issues });
  attachNetworkGuard(page, { env: AUDIT_ENV, issues: run.issues });
  attachPageErrorGuard(page, { env: AUDIT_ENV, issues: run.issues });

  const uniqueSuffix = Date.now();
  const sampleTitle = `E2E_TEST_${uniqueSuffix}`;

  try {
    // Public sweep
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
    await collectHomepagePerf(page, run);

    const heroVideo = page.locator("video").first();
    if (await heroVideo.count()) {
      const src = await heroVideo.locator("source").first().getAttribute("src");
      if (src) {
        const videoResp = await page.request.get(src.startsWith("http") ? src : `${BASE_URL}${src}`);
        if (videoResp.status() >= 400) {
          run.issues.push({
            severity: "minor",
            category: "network",
            status: videoResp.status(),
            url: src,
            message: `Hero video not served cleanly: ${videoResp.status()}`,
          });
        }
      }
    } else {
      run.issues.push({
        severity: "minor",
        category: "flow",
        message: "No hero video element found; fallback background likely active.",
      });
    }

    const comboboxes = page.getByRole("combobox");
    if ((await comboboxes.count()) >= 2) {
      const regionSelect = comboboxes.nth(0);
      const citySelect = comboboxes.nth(1);
      await regionSelect.selectOption({ index: 1 }).catch(() => null);
      await expect(citySelect).toBeVisible();
    }
    homepageOk = true;
    addStep(run, { name: "Public Sweep", ok: true, details: "Homepage, hero media, navbar/dropdowns checked." });

    // Auth flow (Clerk test mode with static verification code)
    const authEmail = buildTestModeEmail();
    await page.goto("/signup", { waitUntil: "domcontentloaded" });
    await fillSignupRequiredFields(page);
    await fillAuthEmail(page, authEmail);
    await continueAuth(page);
    await waitForOtpUi(page);
    await enterStaticVerificationCode(page, STATIC_TEST_CODE);
    await continueAuth(page);
    const dashStart = Date.now();
    await waitForAuthenticatedSignal(page);
    await ensureJobPosterRole(page);
    await page.waitForURL(/\/app\/job-poster|\/app(\/|$)/, { timeout: 60_000 }).catch(() => null);
    await page.waitForLoadState("networkidle");
    run.timings.dashboardLoadMs = Date.now() - dashStart;
    authOk = true;
    addStep(run, { name: "Auth Flow", ok: true, details: "OTP login succeeds and /app loads." });

    await fs.mkdir(path.join(process.cwd(), "test-results", ".auth"), { recursive: true });
    await context.storageState({ path: path.join(process.cwd(), "test-results", ".auth", `${AUDIT_ENV}.json`) });

    // Job poster dashboard checks
    await page.goto("/app/job-poster", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
    dashboardOk = true;

    // Verify jobs endpoint is healthy.
    const jobsResp = await page.request.get(`${BASE_URL}/api/app/job-poster/jobs`);
    if (!jobsResp.ok()) {
      run.issues.push({
        severity: jobsResp.status() >= 500 || jobsResp.status() === 401 || jobsResp.status() === 403 ? "critical" : "minor",
        category: "network",
        status: jobsResp.status(),
        url: "/api/app/job-poster/jobs",
        message: "Job listing endpoint not healthy.",
      });
    }

    // Create lifecycle job and verify OPEN_FOR_ROUTING.
    const createPayload = {
      readyForAppraisal: true,
      jobTitle: sampleTitle,
      scope: "Production manual OTP lifecycle validation job.",
      tradeCategory: "HANDYMAN",
      jobType: "urban",
      address: {
        street: "123 Production Audit St",
        city: "Vancouver",
        provinceOrState: "BC",
        country: "CA",
      },
      items: [{ category: "General", description: "Sample checklist item", quantity: 1 }],
    };

    const submitStart = Date.now();
    const createResp = await page.request.post(`${BASE_URL}/api/app/job-poster/jobs/create-draft`, {
      data: createPayload,
      headers: { "content-type": "application/json" },
    });
    run.timings.jobSubmitResponseMs = Date.now() - submitStart;
    const createJson = (await createResp.json().catch(() => ({}))) as any;
    if (!createResp.ok()) {
      run.issues.push({
        severity: createResp.status() >= 500 || createResp.status() === 401 || createResp.status() === 403 ? "critical" : "minor",
        category: "network",
        status: createResp.status(),
        url: "/api/app/job-poster/jobs/create-draft",
        message: `Job creation failed: ${createJson?.error ?? createJson?.message ?? "unknown"}`,
      });
      throw new Error("Job creation request failed.");
    } else {
      run.job = {
        id: String(createJson?.job?.id ?? ""),
        title: sampleTitle,
        statusBefore: String(createJson?.job?.status ?? "UNKNOWN"),
        statusAfter: String(createJson?.job?.status ?? "UNKNOWN"),
        transitionAction: "none",
      };
    }
    const { jobs } = await fetchJobs(page);
    const created = jobs.find((j: any) => String(j?.title ?? "").trim() === sampleTitle);
    if (!created) throw new Error(`Created job ${sampleTitle} was not found in dashboard jobs list.`);
    const createdStatus = String(created?.status ?? "");
    run.job = {
      ...run.job,
      id: String(created?.id ?? run.job?.id ?? ""),
      statusBefore: createdStatus || run.job?.statusBefore || "UNKNOWN",
      statusAfter: createdStatus || run.job?.statusAfter || "UNKNOWN",
    };
    if (createdStatus !== "OPEN_FOR_ROUTING") {
      throw new Error(`Expected job status OPEN_FOR_ROUTING but received ${createdStatus || "UNKNOWN"}.`);
    }
    jobCreationOk = true;

    // Cleanup must transition to ARCHIVED or CANCELLED.
    await page.goto("/app/job-poster/jobs", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    const row = page.getByText(sampleTitle, { exact: false }).first();
    if (!(await row.count())) {
      throw new Error(`Unable to locate created job row for cleanup: ${sampleTitle}`);
    }
    await row.click().catch(() => null);
    const archivedClicked = await maybeClick(page, ["archive", "mark as archived"]);
    const cancelledClicked = archivedClicked ? false : await maybeClick(page, ["cancel", "mark as cancelled"]);
    if (!(archivedClicked || cancelledClicked)) {
      throw new Error("Cleanup failed: neither ARCHIVE nor CANCEL action is available.");
    }
    await maybeClick(page, ["confirm", "archive", "cancel"]);

    const transitionExpected = archivedClicked ? "ARCHIVED" : "CANCELLED";
    let transitionOk = false;
    for (let i = 0; i < 12; i += 1) {
      const next = await fetchJobs(page);
      const cleanupJob = next.jobs.find((j: any) => String(j?.title ?? "").trim() === sampleTitle);
      const status = String(cleanupJob?.status ?? "");
      if (status === "ARCHIVED" || status === "CANCELLED") {
        run.job = {
          ...run.job,
          id: String(cleanupJob?.id ?? run.job?.id ?? ""),
          statusAfter: status,
          transitionAction: status as "ARCHIVED" | "CANCELLED",
        };
        transitionOk = true;
        break;
      }
      await page.waitForTimeout(2000);
    }
    if (!transitionOk) {
      throw new Error(`Cleanup failed: job did not reach ARCHIVED/CANCELLED after ${transitionExpected} action.`);
    }
    cleanupOk = true;

    addStep(run, { name: "Job Poster Dashboard", ok: true, details: "Dashboard and sample job workflow executed." });

    failIfCriticalIssues(run);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    run.issues.push({ severity: "critical", category: "flow", message: msg, url: page.url() });
    addStep(run, { name: "Execution", ok: false, details: msg });
    throw error;
  } finally {
    await writeRunArtifact(run);
    console.log("=== 8Fold Production Test Report ===");
    console.log(`Homepage: ${statusLabel(homepageOk)}`);
    console.log(`Auth: ${statusLabel(authOk)}`);
    console.log(`Dashboard: ${statusLabel(dashboardOk)}`);
    console.log(`Job Creation: ${statusLabel(jobCreationOk)}`);
    console.log(`Cleanup: ${statusLabel(cleanupOk)}`);
  }
});

