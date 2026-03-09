import { requireAdminIdentity } from "@/src/adminBus/auth";
import {
  getTemplate,
  upsertTemplate,
} from "@/src/services/v4/notifications/notificationTemplateService";
import { DEFAULT_TEMPLATES } from "@/src/services/v4/notifications/defaultTemplates";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ type: string }> }) {
  const authed = await requireAdminIdentity(req);
  if (authed instanceof Response) return authed;

  const { type } = await params;
  const notificationType = type.toUpperCase();

  try {
    const dbTpl = await getTemplate(notificationType);
    const def = DEFAULT_TEMPLATES[notificationType] ?? null;

    if (!dbTpl && !def) {
      return NextResponse.json({ ok: false, error: "Unknown notification type" }, { status: 404 });
    }

    const template = dbTpl ?? {
      id: null,
      notificationType,
      category: def!.category,
      emailSubject: def!.emailSubject ?? null,
      emailTemplate: def!.emailTemplate ?? null,
      inAppTemplate: def!.inAppTemplate ?? null,
      enabledEmail: true,
      enabledInApp: true,
      supportsEmail: def!.supportsEmail,
      supportsInApp: def!.supportsInApp,
      variables: def!.variables,
      updatedAt: null,
      updatedBy: null,
      _source: "default",
    };

    return NextResponse.json({ ok: true, template });
  } catch (error) {
    console.error("[ADMIN_API] notification-templates GET [type] failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load template" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ type: string }> }) {
  const authed = await requireAdminIdentity(req);
  if (authed instanceof Response) return authed;

  const { type } = await params;
  const notificationType = type.toUpperCase();

  try {
    const body = await req.json();
    const updated = await upsertTemplate(authed.adminId, {
      notificationType,
      category: body.category,
      emailSubject: body.emailSubject,
      emailTemplate: body.emailTemplate,
      inAppTemplate: body.inAppTemplate,
      enabledEmail: body.enabledEmail,
      enabledInApp: body.enabledInApp,
      supportsEmail: body.supportsEmail,
      supportsInApp: body.supportsInApp,
      variables: body.variables,
    });
    return NextResponse.json({ ok: true, template: updated });
  } catch (error) {
    console.error("[ADMIN_API] notification-templates PUT [type] failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update template" },
      { status: 500 },
    );
  }
}
