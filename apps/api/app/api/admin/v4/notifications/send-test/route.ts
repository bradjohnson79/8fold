import { requireAdminIdentity } from "@/src/adminBus/auth";
import { resolveTemplate, renderSubject, renderHtml } from "@/src/services/v4/notifications/notificationTemplateService";
import { logDelivery } from "@/src/services/v4/notifications/notificationDeliveryLogService";
import { sendTransactionalEmail } from "@/src/mailer/sendTransactionalEmail";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const authed = await requireAdminIdentity(req);
  if (authed instanceof Response) return authed;

  try {
    const body = await req.json();
    const { notificationType, recipientEmail, templateVars } = body;

    if (!notificationType || typeof notificationType !== "string") {
      return NextResponse.json({ ok: false, error: "notificationType is required" }, { status: 400 });
    }
    if (!recipientEmail || typeof recipientEmail !== "string" || !recipientEmail.includes("@")) {
      return NextResponse.json({ ok: false, error: "Valid recipientEmail is required" }, { status: 400 });
    }

    const type = notificationType.toUpperCase();
    const tpl = await resolveTemplate(type);

    if (!tpl.emailSubject || !tpl.emailTemplate) {
      return NextResponse.json(
        { ok: false, error: `No email template found for type: ${type}` },
        { status: 400 },
      );
    }

    const vars: Record<string, string> = {
      platform_name: "8Fold",
      dashboard_link: `${process.env.WEB_APP_URL ?? ""}/dashboard`,
      contractor_name: "[Contractor Name]",
      job_poster_name: "[Job Poster Name]",
      router_name: "[Router Name]",
      job_title: "[Test Job Title]",
      job_location: "[Test Location]",
      job_price: "$0.00",
      ...(templateVars && typeof templateVars === "object" ? templateVars : {}),
    };

    const subject = `[TEST] ${renderSubject(tpl.emailSubject, vars)}`;
    const html = renderHtml(tpl.emailTemplate, vars);

    await sendTransactionalEmail({ to: recipientEmail, subject, html });

    // Log with is_test=true — never creates in-app notifications
    await logDelivery({
      notificationId: null,
      notificationType: type,
      recipientUserId: authed.adminId,
      recipientEmail,
      channel: "EMAIL",
      status: "DELIVERED",
      isTest: true,
      metadata: { sentByAdmin: authed.adminId, templateVars: vars },
    });

    return NextResponse.json({
      ok: true,
      message: `Test email sent to ${recipientEmail}`,
      subject,
      templateSource: tpl.source,
    });
  } catch (error) {
    console.error("[ADMIN_API] send-test failed", error);

    // Still log the failure
    try {
      const body = await (req.clone() as Request).json().catch(() => ({}));
      await logDelivery({
        notificationType: String(body.notificationType ?? "UNKNOWN"),
        recipientUserId: authed.adminId,
        recipientEmail: String(body.recipientEmail ?? ""),
        channel: "EMAIL",
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : String(error),
        isTest: true,
      });
    } catch {
      // swallow
    }

    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to send test email" },
      { status: 500 },
    );
  }
}
