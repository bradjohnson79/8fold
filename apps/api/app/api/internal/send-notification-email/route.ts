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
import { v4NotificationDeliveryLogs } from "@/db/schema/v4NotificationDeliveryLog";
import { DEFAULT_TEMPLATES } from "@/src/services/v4/notifications/defaultTemplates";
import { resolveTemplate, renderSubject, renderHtml } from "@/src/services/v4/notifications/notificationTemplateService";
import { logDelivery } from "@/src/services/v4/notifications/notificationDeliveryLogService";
import { hydrateRefundEmailMetadata } from "@/src/services/refunds/refundEmailMetadataService";
import { sendTransactionalEmail } from "@/src/mailer/sendTransactionalEmail";
import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function hasDeliveredEmailForDedupe(args: {
  notificationType: string;
  recipientUserId: string;
  dedupeKey: string;
}): Promise<boolean> {
  const rows = await db
    .select({ id: v4NotificationDeliveryLogs.id })
    .from(v4NotificationDeliveryLogs)
    .where(
      and(
        eq(v4NotificationDeliveryLogs.notificationType, args.notificationType),
        eq(v4NotificationDeliveryLogs.recipientUserId, args.recipientUserId),
        eq(v4NotificationDeliveryLogs.channel, "EMAIL"),
        eq(v4NotificationDeliveryLogs.dedupeKey, args.dedupeKey),
        inArray(v4NotificationDeliveryLogs.status, ["DELIVERED", "SKIPPED"]),
      ),
    )
    .orderBy(desc(v4NotificationDeliveryLogs.createdAt))
    .limit(1);

  return Boolean(rows[0]?.id);
}

export async function POST(req: Request) {
  const internalKey = req.headers.get("x-internal-key") ?? "";
  const expectedKey = process.env.INTERNAL_DEBUG_SECRET ?? "";
  if (!expectedKey || internalKey !== expectedKey) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    userId?: string;
    overrideEmail?: string | null;
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

  const { userId, overrideEmail, notificationType, metadata, dedupeKey, eventId } = body;

  // overrideEmail allows sending to a fixed address (e.g. info@8fold.app) without a DB user lookup.
  // At least one of userId or overrideEmail must be present.
  if (!overrideEmail && !userId) {
    return NextResponse.json({ ok: false, error: "Missing userId or overrideEmail" }, { status: 400 });
  }
  if (!notificationType) {
    return NextResponse.json({ ok: false, error: "Missing notificationType" }, { status: 400 });
  }

  try {
    const resolvedTemplate = await resolveTemplate(notificationType);
    const tpl =
      notificationType === "JOB_REFUNDED" &&
      (!resolvedTemplate.emailEnabled || !resolvedTemplate.emailSubject || !resolvedTemplate.emailTemplate)
        ? {
            ...resolvedTemplate,
            emailEnabled: true,
            emailSubject: DEFAULT_TEMPLATES.JOB_REFUNDED.emailSubject ?? null,
            emailTemplate: DEFAULT_TEMPLATES.JOB_REFUNDED.emailTemplate ?? null,
          }
        : resolvedTemplate;
    if (!tpl.emailEnabled || !tpl.emailSubject || !tpl.emailTemplate) {
      return NextResponse.json({ ok: true, skipped: true, reason: "email_disabled_or_no_template" });
    }

    const dashboardLink = `${process.env.WEB_APP_URL ?? ""}/dashboard`;

    // Spread raw metadata first (preserves camelCase keys for any new templates),
    // then add explicit snake_case aliases so legacy {{snake_case}} templates
    // render correctly regardless of which key convention the event payload uses.
    const metadataForTemplate =
      notificationType === "JOB_REFUNDED"
        ? await hydrateRefundEmailMetadata({ userId: userId ?? null, metadata: metadata ?? {} })
        : Object.fromEntries(Object.entries(metadata ?? {}).map(([k, v]) => [k, String(v ?? "")]));
    const raw: Record<string, string> = metadataForTemplate;
    const vars: Record<string, string> = {
      platform_name: "8Fold",
      ...raw,
      // snake_case aliases — resolved from camelCase or pre-existing snake_case
      job_title: raw.jobTitle ?? raw.job_title ?? "",
      job_location: raw.jobLocation ?? raw.job_location ?? "",
      job_price: raw.jobPrice ?? raw.job_price ?? "",
      contractor_name: raw.contractorName ?? raw.contractor_name ?? "",
      router_name: raw.routerName ?? raw.router_name ?? "",
      job_poster_name: raw.jobPosterName ?? raw.job_poster_name ?? "",
      // dashboard_link always wins over any metadata-provided value
      dashboard_link: dashboardLink,
    };

    const subject = renderSubject(tpl.emailSubject, vars);
    const html = renderHtml(tpl.emailTemplate, vars);

    // Resolve recipient: overrideEmail takes precedence over DB lookup.
    let recipientEmail: string | null = overrideEmail ?? null;
    if (!recipientEmail && userId) {
      const userRows = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
      recipientEmail = userRows[0]?.email ?? null;
    }

    if (!recipientEmail) {
      return NextResponse.json({ ok: true, skipped: true, reason: "no_recipient_email" });
    }

    const recipientUserId = userId ?? `override:${overrideEmail}`;
    if (dedupeKey) {
      const alreadyDelivered = await hasDeliveredEmailForDedupe({
        notificationType,
        recipientUserId,
        dedupeKey,
      });
      if (alreadyDelivered) {
        await logDelivery({
          notificationId: undefined,
          notificationType,
          recipientUserId,
          recipientEmail,
          channel: "EMAIL",
          status: "SKIPPED",
          dedupeKey,
          eventId: eventId ?? null,
          metadata: { reason: "duplicate_dedupe_key" },
        });
        return NextResponse.json({ ok: true, skipped: true, reason: "duplicate_dedupe_key" });
      }
    }

    try {
      await sendTransactionalEmail({ to: recipientEmail, subject, html });
      await logDelivery({
        notificationId: undefined,
        notificationType,
        recipientUserId,
        recipientEmail,
        channel: "EMAIL",
        status: "DELIVERED",
        dedupeKey: dedupeKey ?? null,
        eventId: eventId ?? null,
        metadata: { tplSource: tpl.source },
      });
      return NextResponse.json({ ok: true, sent: true });
    } catch (emailErr) {
      console.error("[INTERNAL_EMAIL_SEND_ERROR]", { notificationType, userId: recipientUserId, err: String(emailErr) });
      await logDelivery({
        notificationId: undefined,
        notificationType,
        recipientUserId,
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
