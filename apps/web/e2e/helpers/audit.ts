import fs from "node:fs/promises";
import path from "node:path";
import type { Page, Response } from "@playwright/test";

export type AuditSeverity = "critical" | "minor";

export type AuditIssue = {
  severity: AuditSeverity;
  category: "console" | "network" | "flow";
  message: string;
  url?: string;
  status?: number;
};

export type AuditStep = {
  name: string;
  ok: boolean;
  details: string;
};

export type AuditRunRecord = {
  env: "local" | "production";
  baseUrl: string;
  startedAt: string;
  finishedAt?: string;
  steps: AuditStep[];
  issues: AuditIssue[];
  timings: {
    ttfbMs?: number;
    fcpMs?: number;
    dashboardLoadMs?: number;
    jobSubmitResponseMs?: number;
  };
  job?: {
    id?: string;
    title?: string;
    statusBefore?: string;
    statusAfter?: string;
    transitionAction?: "ARCHIVED" | "CANCELLED" | "none";
  };
};

type GuardOpts = {
  env: "local" | "production";
  issues: AuditIssue[];
};

const CONSOLE_IGNORE_PATTERNS = [
  /extension/i,
  /devtools/i,
  /preload/i,
  /chrome-extension:/i,
  /react.+strict mode/i,
];

const URL_IGNORE_PATTERNS = [
  /\/favicon\.ico/i,
  /google-analytics\.com/i,
  /googletagmanager\.com/i,
  /analytics/i,
  /\/_next\/(static|image)\//i,
];

function shouldIgnoreConsole(text: string, env: "local" | "production"): boolean {
  if (env === "local" && /strict mode/i.test(text)) return true;
  return CONSOLE_IGNORE_PATTERNS.some((re) => re.test(text));
}

function shouldIgnoreResponse(url: string): boolean {
  return URL_IGNORE_PATTERNS.some((re) => re.test(url));
}

export function attachConsoleGuard(page: Page, opts: GuardOpts) {
  page.on("console", (msg) => {
    const text = msg.text() || "";
    if (msg.type() === "error") {
      opts.issues.push({
        severity: "critical",
        category: "console",
        message: text || "Console error detected",
        url: page.url(),
      });
      return;
    }
    if (shouldIgnoreConsole(text, opts.env)) return;
    if (/UnhandledPromiseRejection/i.test(text)) {
      opts.issues.push({
        severity: "critical",
        category: "console",
        message: text,
        url: page.url(),
      });
    }
  });
}

export function attachPageErrorGuard(page: Page, opts: GuardOpts) {
  page.on("pageerror", (error) => {
    const text = error instanceof Error ? error.message : String(error);
    opts.issues.push({
      severity: "critical",
      category: "console",
      message: `Unhandled runtime error: ${text}`,
      url: page.url(),
    });
  });
}

export function attachNetworkGuard(page: Page, opts: GuardOpts) {
  page.on("response", async (response: Response) => {
    const status = response.status();
    const url = response.url();
    if (shouldIgnoreResponse(url)) return;

    if (status >= 500) {
      opts.issues.push({
        severity: "critical",
        category: "network",
        status,
        url,
        message: `Server error ${status} at ${url}`,
      });
      return;
    }

  });
}

export function createRunRecord(env: "local" | "production", baseUrl: string): AuditRunRecord {
  return {
    env,
    baseUrl,
    startedAt: new Date().toISOString(),
    steps: [],
    issues: [],
    timings: {},
    job: { transitionAction: "none" },
  };
}

export function addStep(record: AuditRunRecord, step: AuditStep) {
  record.steps.push(step);
}

export async function collectHomepagePerf(page: Page, record: AuditRunRecord) {
  const navTiming = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const paints = performance.getEntriesByType("paint");
    const fcp = paints.find((e) => e.name === "first-contentful-paint")?.startTime;
    return {
      responseStart: nav?.responseStart,
      fcp,
    };
  });
  if (typeof navTiming.responseStart === "number") record.timings.ttfbMs = Math.round(navTiming.responseStart);
  if (typeof navTiming.fcp === "number") record.timings.fcpMs = Math.round(navTiming.fcp);
}

export function failIfCriticalIssues(record: AuditRunRecord) {
  const critical = record.issues.filter((i) => i.severity === "critical");
  if (critical.length) {
    const lines = critical.map((i) => `${i.category.toUpperCase()}: ${i.message}`);
    throw new Error(`Critical audit issues found:\n${lines.join("\n")}`);
  }
}

export async function writeRunArtifact(record: AuditRunRecord) {
  const root = process.cwd();
  const outDir = path.join(root, "test-results", "audit");
  await fs.mkdir(outDir, { recursive: true });
  record.finishedAt = new Date().toISOString();
  const outPath = path.join(outDir, `${record.env}.json`);
  await fs.writeFile(outPath, JSON.stringify(record, null, 2), "utf8");
}

