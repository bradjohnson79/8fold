import { requireAdminIdentity } from "@/src/adminBus/auth";
import { getSmtpConfig } from "@/src/auth/sendLoginCodeEmail";
import { db } from "@/db/drizzle";
import { v4EventOutbox } from "@/db/schema/v4EventOutbox";
import { v4NotificationDeliveryLogs } from "@/db/schema/v4NotificationDeliveryLog";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authed = await requireAdminIdentity(req);
  if (authed instanceof Response) return authed;

  // ── SMTP health check ────────────────────────────────────────────────────
  const cfg = getSmtpConfig();
  let smtpStatus: "online" | "error" | "unconfigured" = "unconfigured";
  let smtpError: string | null = null;
  let lastSmtpVerifiedAt: string | null = null;

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
      lastSmtpVerifiedAt = new Date().toISOString();
    } catch (err) {
      smtpStatus = "error";
      smtpError = err instanceof Error ? err.message : String(err);
      lastSmtpVerifiedAt = new Date().toISOString();
    }
  }

  // ── Event outbox depth ───────────────────────────────────────────────────
  let eventOutboxPendingCount = 0;
  try {
    const result = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(v4EventOutbox)
      .where(isNull(v4EventOutbox.processedAt));
    eventOutboxPendingCount = result[0]?.count ?? 0;
  } catch {
    // Outbox table may not exist yet in some envs — non-fatal
  }

  const eventOutbox: "idle" | "backed_up" = eventOutboxPendingCount > 10 ? "backed_up" : "idle";

  // ── Last real email sent ─────────────────────────────────────────────────
  let lastEmailSentAt: string | null = null;
  try {
    const rows = await db
      .select({ createdAt: v4NotificationDeliveryLogs.createdAt })
      .from(v4NotificationDeliveryLogs)
      .where(
        and(
          eq(v4NotificationDeliveryLogs.channel, "EMAIL"),
          eq(v4NotificationDeliveryLogs.status, "DELIVERED"),
          eq(v4NotificationDeliveryLogs.isTest, false),
        ),
      )
      .orderBy(desc(v4NotificationDeliveryLogs.createdAt))
      .limit(1);
    lastEmailSentAt = rows[0]?.createdAt?.toISOString() ?? null;
  } catch {
    // Delivery log table may not exist yet — non-fatal
  }

  return NextResponse.json({
    ok: true,
    smtp: smtpStatus,
    smtpError,
    eventOutbox,
    eventOutboxPendingCount,
    lastEmailSentAt,
    lastSmtpVerifiedAt,
    lastSmtpError: smtpError,
  });
}
