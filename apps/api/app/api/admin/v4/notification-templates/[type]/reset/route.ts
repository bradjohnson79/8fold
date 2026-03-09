import { requireAdminIdentity } from "@/src/adminBus/auth";
import { resetToDefault } from "@/src/services/v4/notifications/notificationTemplateService";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ type: string }> }) {
  const authed = await requireAdminIdentity(req);
  if (authed instanceof Response) return authed;

  const { type } = await params;
  const notificationType = type.toUpperCase();

  try {
    const template = await resetToDefault(authed.adminId, notificationType);
    if (!template) {
      return NextResponse.json(
        { ok: false, error: `No default template found for type: ${notificationType}` },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, template });
  } catch (error) {
    console.error("[ADMIN_API] notification-templates reset failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to reset template" },
      { status: 500 },
    );
  }
}
