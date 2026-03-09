import { requireAdminIdentity } from "@/src/adminBus/auth";
import { listTemplates } from "@/src/services/v4/notifications/notificationTemplateService";
import { DEFAULT_TEMPLATES } from "@/src/services/v4/notifications/defaultTemplates";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authed = await requireAdminIdentity(req);
  if (authed instanceof Response) return authed;

  try {
    const dbTemplates = await listTemplates();
    const dbMap = new Map(dbTemplates.map((t) => [t.notificationType, t]));

    // Merge DB templates with known defaults so all types always appear in the list
    const allTypes = Object.keys(DEFAULT_TEMPLATES);
    const merged = allTypes.map((type) => {
      const db = dbMap.get(type);
      const def = DEFAULT_TEMPLATES[type]!;
      return db ?? {
        id: null,
        notificationType: type,
        category: def.category,
        emailSubject: def.emailSubject ?? null,
        emailTemplate: def.emailTemplate ?? null,
        inAppTemplate: def.inAppTemplate ?? null,
        enabledEmail: true,
        enabledInApp: true,
        supportsEmail: def.supportsEmail,
        supportsInApp: def.supportsInApp,
        variables: def.variables,
        updatedAt: null,
        updatedBy: null,
        _source: "default",
      };
    });

    // Group by category
    const grouped: Record<string, typeof merged> = {};
    for (const t of merged) {
      const cat = t.category ?? "System";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat]!.push(t);
    }

    return NextResponse.json({ ok: true, templates: merged, grouped });
  } catch (error) {
    console.error("[ADMIN_API] notification-templates GET failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to list templates" },
      { status: 500 },
    );
  }
}
