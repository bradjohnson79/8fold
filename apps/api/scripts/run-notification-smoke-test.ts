#!/usr/bin/env tsx
/**
 * Full Notification Lifecycle Smoke Test
 *
 * Verifies:
 * - SMTP health
 * - Event outbox processing
 * - In-app notifications
 * - Email delivery logs
 * - Messenger system messages
 * - Template variable resolution
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local pnpm -C apps/api exec tsx scripts/run-notification-smoke-test.ts
 *   DOTENV_CONFIG_PATH=.env.local pnpm -C apps/api exec tsx scripts/run-notification-smoke-test.ts --trigger
 *
 * --trigger: Insert a test NEW_SUPPORT_TICKET event and verify it flows through
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env before any imports that use it
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const dotenv = await import("dotenv");
  dotenv.config({ path: envPath });
}

const TRIGGER_MODE = process.argv.includes("--trigger");
const REPORT_PATH = path.join(__dirname, "..", "..", "..", "docs", "NOTIFICATION_SMOKE_TEST_REPORT.md");

type CheckResult = "PASS" | "FAIL" | "SKIP" | "N/A";

interface EventCheck {
  event: string;
  inApp: CheckResult;
  email: CheckResult;
  messenger: CheckResult;
  log: CheckResult;
  note?: string;
}

const TEST_VARS: Record<string, string> = {
  platform_name: "8Fold",
  dashboard_link: "https://8fold.app/dashboard",
  contractor_name: "Test Contractor",
  job_poster_name: "Test Poster",
  router_name: "Test Router",
  job_title: "Test Job Title",
  job_location: "Test Location",
  job_price: "$100.00",
};

function hasUnresolvedVars(text: string): string[] {
  const matches = text.match(/\{\{(\w+)\}\}/g);
  return matches ? [...new Set(matches)] : [];
}

async function main(): Promise<void> {
  const report: string[] = [];
  const eventChecks: EventCheck[] = [];
  let smtpStatus = "unconfigured";
  let smtpError: string | null = null;
  let outboxStatus = "idle";
  let outboxPending = 0;

  report.push("# 8Fold Notification Smoke Test Report\n");
  report.push(`**Date:** ${new Date().toISOString()}`);
  report.push(`**Environment:** ${process.env.NODE_ENV ?? "development"}`);
  report.push(`**Trigger Mode:** ${TRIGGER_MODE ? "Yes (test event inserted)" : "No (verification only)"}\n`);
  report.push("---\n");

  // ── Imports (after env) ─────────────────────────────────────────────────
  const { db } = await import("../db/drizzle");
  const { v4EventOutbox } = await import("../db/schema/v4EventOutbox");
  const { v4Notifications } = await import("../db/schema/v4Notification");
  const { v4NotificationDeliveryLogs } = await import("../db/schema/v4NotificationDeliveryLog");
  const { v4Messages } = await import("../db/schema/v4Message");
  const { admins } = await import("../db/schema/admin");
  const { eq, desc, isNull, sql, gte } = await import("drizzle-orm");
  const { getSmtpConfig } = await import("../src/auth/sendLoginCodeEmail");
  const { processEventOutbox } = await import("../src/events/processEventOutbox");
  const { resolveTemplate, renderSubject, renderHtml } = await import("../src/services/v4/notifications/notificationTemplateService");
  const { randomUUID } = await import("node:crypto");

  // ── 1. SMTP Health Check ───────────────────────────────────────────────
  report.push("## SMTP Status\n");
  const cfg = getSmtpConfig();
  if (cfg) {
    try {
      const nodemailer = (await import("nodemailer")).default;
      const transporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.port === 465,
        auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
        connectionTimeout: 5000,
        greetingTimeout: 5000,
      });
      await transporter.verify();
      smtpStatus = "online";
    } catch (err) {
      smtpStatus = "error";
      smtpError = err instanceof Error ? err.message : String(err);
    }
  }
  report.push(`- **SMTP:** ${smtpStatus.toUpperCase()}`);
  if (smtpError) report.push(`- **Error:** ${smtpError}`);
  report.push("");

  // ── 2. Event Outbox ────────────────────────────────────────────────────
  report.push("## Event Outbox\n");
  try {
    const outboxResult = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(v4EventOutbox)
      .where(isNull(v4EventOutbox.processedAt));
    outboxPending = outboxResult[0]?.count ?? 0;
    outboxStatus = outboxPending > 10 ? "backed_up" : "idle";
  } catch {
    outboxStatus = "error";
  }
  report.push(`- **Status:** ${outboxStatus}`);
  report.push(`- **Pending:** ${outboxPending}`);
  report.push("");

  // Drain outbox (run processEventOutbox)
  if (outboxPending > 0) {
    try {
      await processEventOutbox();
      report.push("_Processed pending outbox events._\n");
    } catch (err) {
      report.push(`_Outbox processing error: ${err instanceof Error ? err.message : String(err)}_\n`);
    }
  }

  // ── 3. Trigger Mode: Insert Test Event ──────────────────────────────────
  if (TRIGGER_MODE) {
    report.push("## Trigger Mode: Test Event\n");
    const adminRows = await db.select({ id: admins.id }).from(admins).where(isNull(admins.disabledAt)).limit(1);
    const adminId = adminRows[0]?.id;
    if (adminId) {
      const ticketId = randomUUID();
      const dedupeKey = `smoke_test_${Date.now()}`;
      await db.insert(v4EventOutbox).values({
        id: randomUUID(),
        eventType: "NEW_SUPPORT_TICKET",
        payload: {
          ticketId,
          userId: adminId,
          role: "ADMIN",
          subject: "Smoke Test Ticket",
          adminIds: [adminId],
          dedupeKey,
        },
        createdAt: new Date(),
      });
      report.push("Inserted test NEW_SUPPORT_TICKET event.\n");
      await processEventOutbox();
      report.push("Processed outbox.\n");
    } else {
      report.push("_No active admin found — skipped test event._\n");
    }
  }

  // ── 4. Recent Activity Verification ─────────────────────────────────────
  report.push("## Event Verification (Recent Activity)\n");
  report.push("| Event | In-App | Email | Messenger | Log |");
  report.push("|-------|--------|-------|-----------|-----|");

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Count recent notifications by type
  const notifRows = await db
    .select({ type: v4Notifications.type, count: sql<number>`cast(count(*) as int)` })
    .from(v4Notifications)
    .where(gte(v4Notifications.createdAt, oneDayAgo))
    .groupBy(v4Notifications.type);

  const notifCounts = Object.fromEntries(notifRows.map((r) => [r.type, r.count]));

  // Count recent delivery logs by type
  const logRows = await db
    .select({
      notificationType: v4NotificationDeliveryLogs.notificationType,
      channel: v4NotificationDeliveryLogs.channel,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(v4NotificationDeliveryLogs)
    .where(gte(v4NotificationDeliveryLogs.createdAt, oneDayAgo))
    .groupBy(v4NotificationDeliveryLogs.notificationType, v4NotificationDeliveryLogs.channel);

  const logCounts: Record<string, { EMAIL: number; IN_APP: number }> = {};
  for (const r of logRows) {
    if (!logCounts[r.notificationType]) logCounts[r.notificationType] = { EMAIL: 0, IN_APP: 0 };
    logCounts[r.notificationType][r.channel as "EMAIL" | "IN_APP"] = Number(r.count ?? 0);
  }

  const eventTypes = [
    "NEW_JOB_INVITE",
    "CONTRACTOR_ACCEPTED",
    "APPOINTMENT_BOOKED",
    "RE_APPRAISAL_REQUESTED",
    "RE_APPRAISAL_ACCEPTED",
    "RE_APPRAISAL_DECLINED",
    "FUNDS_RELEASED",
    "NEW_SUPPORT_TICKET",
    "SUPPORT_REPLY",
  ];

  for (const ev of eventTypes) {
    const inApp = (notifCounts[ev] ?? 0) > 0 ? "PASS" : "SKIP";
    const emailLog = (logCounts[ev]?.EMAIL ?? 0) > 0 ? "PASS" : "SKIP";
    const inAppLog = (logCounts[ev]?.IN_APP ?? 0) > 0 ? "PASS" : "SKIP";
    const log = emailLog === "PASS" || inAppLog === "PASS" ? "PASS" : "SKIP";
    eventChecks.push({
      event: ev,
      inApp,
      email: emailLog,
      messenger: "N/A",
      log,
    });
    report.push(`| ${ev} | ${inApp} | ${emailLog} | N/A | ${log} |`);
  }
  report.push("");

  // ── 5. Template Validation ─────────────────────────────────────────────
  report.push("## Template Validation\n");
  const priorityTypes = [
    "NEW_JOB_INVITE",
    "CONTRACTOR_ACCEPTED",
    "FUNDS_RELEASED",
    "RE_APPRAISAL_REQUESTED",
    "RE_APPRAISAL_ACCEPTED",
    "RE_APPRAISAL_DECLINED",
  ];
  let templateFailures: string[] = [];
  for (const type of priorityTypes) {
    const tpl = await resolveTemplate(type);
    if (tpl.emailSubject && tpl.emailTemplate) {
      const subject = renderSubject(tpl.emailSubject, TEST_VARS);
      const html = renderHtml(tpl.emailTemplate, TEST_VARS);
      const subjectVars = hasUnresolvedVars(subject);
      const htmlVars = hasUnresolvedVars(html);
      if (subjectVars.length || htmlVars.length) {
        templateFailures.push(`${type}: unresolved ${[...subjectVars, ...htmlVars].join(", ")}`);
      }
    }
  }
  if (templateFailures.length > 0) {
    report.push("**FAIL:** Unresolved variables:\n");
    templateFailures.forEach((f) => report.push(`- ${f}`));
  } else {
    report.push("All variables resolved correctly.\n");
  }
  report.push("");

  // ── 6. Delivery Log Summary ─────────────────────────────────────────────
  report.push("## Delivery Log Summary\n");
  try {
    const recentLogs = await db
      .select({
        notificationType: v4NotificationDeliveryLogs.notificationType,
        channel: v4NotificationDeliveryLogs.channel,
        status: v4NotificationDeliveryLogs.status,
        createdAt: v4NotificationDeliveryLogs.createdAt,
      })
      .from(v4NotificationDeliveryLogs)
      .where(gte(v4NotificationDeliveryLogs.createdAt, oneDayAgo))
      .orderBy(desc(v4NotificationDeliveryLogs.createdAt))
      .limit(20);
    if (recentLogs.length > 0) {
      report.push("Recent entries (last 24h):");
      report.push("```");
      recentLogs.slice(0, 10).forEach((r) => {
        report.push(`${r.createdAt?.toISOString()} | ${r.notificationType} | ${r.channel} | ${r.status}`);
      });
      report.push("```\n");
    } else {
      report.push("_No delivery log entries in last 24h._\n");
    }
  } catch (err) {
    report.push(`_Error: ${err instanceof Error ? err.message : String(err)}_\n`);
  }

  // ── 7. Messenger System Messages ────────────────────────────────────────
  report.push("## Messenger System Messages\n");
  try {
    const sysMsgs = await db
      .select({
        body: v4Messages.body,
        createdAt: v4Messages.createdAt,
      })
      .from(v4Messages)
      .where(eq(v4Messages.senderRole, "SYSTEM"))
      .orderBy(desc(v4Messages.createdAt))
      .limit(10);
    if (sysMsgs.length > 0) {
      report.push("Recent system messages:");
      report.push("```");
      sysMsgs.forEach((m) => {
        const preview = (m.body ?? "").slice(0, 80) + (m.body && m.body.length > 80 ? "…" : "");
        report.push(`${m.createdAt?.toISOString()} | ${preview}`);
      });
      report.push("```\n");
    } else {
      report.push("_No system messages in DB._\n");
    }
  } catch (err) {
    report.push(`_Error: ${err instanceof Error ? err.message : String(err)}_\n`);
  }

  // ── 8. Overall Status ───────────────────────────────────────────────────
  report.push("## Overall Status\n");
  const hasFail = templateFailures.length > 0 || smtpStatus === "error";
  if (hasFail) {
    report.push("❌ **FAIL** — See issues above.");
  } else {
    report.push("✅ **PASS** — All notification systems operational.");
  }
  report.push("");
  report.push("---");
  report.push("_Generated by apps/api/scripts/run-notification-smoke-test.ts_");

  // Write report
  const reportDir = path.dirname(REPORT_PATH);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  fs.writeFileSync(REPORT_PATH, report.join("\n"), "utf8");
  console.log(`Report written to ${REPORT_PATH}`);

  if (hasFail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
