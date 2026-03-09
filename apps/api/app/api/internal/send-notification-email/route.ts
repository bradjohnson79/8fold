/**
 * Internal endpoint for sending transactional notification emails.
 *
 * This route exists because nodemailer (and the mailer stack) must run on the
 * Node.js runtime only. The notificationService is statically imported by the
 * outbox-worker chain that instrumentation.ts compiles for the edge runtime.
 * Any nodemailer import in that chain causes Vercel's edge validator to reject
 * the deployment.
 *
 * Instead, notificationService fires-and-forgets a fetch() to this endpoint,
 * keeping nodemailer completely out of the instrumentation / edge bundle.
 *
 * Security: protected by x-internal-key matching INTERNAL_DEBUG_SECRET.
 */
import { db } from "@/db/drizzle";
import { users } from "@/db/schema/user";
import { resolveTemplate, renderSubject, renderHtml } from "@/src/services/v4/notifications/notificationTemplateService";
import { logDelivery } from "@/src/services/v4/notifications/notificationDeliveryLogService";
import { sendTransactionalEmail } from "@/src/mailer/sendTransactionalEmail";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const internalKey = req.headers.get("x-internal-key") ?? "";
  const expectedKey = process.env.INTERNAL_DEBUG_SECRET ?? "";
  if (!expectedKey || internalKey !== expectedKey) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    userId?: string;
    notificationType?: string;
    metadata?: Record<string, unknown>;
    dedupeKey?: string | null;
    eventId?: string | null;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { userId, notificationType, metadata, dedupeKey, eventId } = body;

  if (!userId || !notificationType) {
    return NextResponse.json({ ok: false, error: "Missing userId or notificationType" }, { status: 400 });
  }

  try {
    const tpl = await resolveTemplate(notificationType);
    if (!tpl.emailEnabled || !tpl.emailSubject || !tpl.emailTemplate) {
      return NextResponse.json({ ok: true, skipped: true, reason: "email_disabled_or_no_template" });
    }

    const dashboardLink = `${process.env.WEB_APP_URL ?? ""}/dashboard`;
    const vars: Record<string, string> = {
      platform_name: "8Fold",
      dashboard_link: dashboardLink,
      ...Object.fromEntries(Object.entries(metadata ?? {}).map(([k, v]) => [k, String(v ?? "")])),
    };

    const subject = renderSubject(tpl.emailSubject, vars);
    const html = renderHtml(tpl.emailTemplate, vars);

    const userRows = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    const recipientEmail = userRows[0]?.email ?? null;

    if (!recipientEmail) {
      return NextResponse.json({ ok: true, skipped: true, reason: "no_recipient_email" });
    }

    try {
      await sendTransactionalEmail({ to: recipientEmail, subject, html });
      await logDelivery({
        notificationId: undefined,
        notificationType,
        recipientUserId: userId,
        recipientEmail,
        channel: "EMAIL",
        status: "DELIVERED",
        dedupeKey: dedupeKey ?? null,
        eventId: eventId ?? null,
        metadata: { tplSource: tpl.source },
      });
      return NextResponse.json({ ok: true, sent: true });
    } catch (emailErr) {
      console.error("[INTERNAL_EMAIL_SEND_ERROR]", { notificationType, userId, err: String(emailErr) });
      await logDelivery({
        notificationId: undefined,
        notificationType,
        recipientUserId: userId,
        recipientEmail,
        channel: "EMAIL",
        status: "FAILED",
        errorMessage: String(emailErr),
        dedupeKey: dedupeKey ?? null,
        eventId: eventId ?? null,
      });
      return NextResponse.json({ ok: false, error: "Email send failed" }, { status: 500 });
    }
  } catch (err) {
    console.error("[INTERNAL_EMAIL_ROUTE_ERROR]", { notificationType, userId, err: String(err) });
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
