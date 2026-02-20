import { defineConfig } from "@playwright/test";

const isProdAudit = String(process.env.AUDIT_ENV ?? "").toLowerCase() === "production";

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: isProdAudit ? 0 : 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL: process.env.AUDIT_BASE_URL || "http://localhost:3006",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "default",
    },
    {
      name: "production-manual-otp",
      retries: 0,
      use: {
        baseURL: "https://8fold.app",
        headless: false,
      },
    },
    {
      name: "production-test-mode",
      retries: 0,
      fullyParallel: false,
      use: {
        baseURL: "https://8fold.app",
        headless: true,
      },
    },
  ],
});

