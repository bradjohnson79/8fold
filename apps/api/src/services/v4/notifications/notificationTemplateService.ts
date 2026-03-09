/**
 * Notification Template Service
 *
 * Manages editable email/in-app templates stored in v4_notification_templates.
 * Implements 3-tier fallback:
 *   1. DB template exists + enabled → use it
 *   2. DB template disabled → honor disable, skip channel
 *   3. DB template missing or broken → fall back to hardcoded default, log warning
 *
 * Two render modes:
 *   renderSubject() — plain string replace (no escaping — subjects are plain text)
 *   renderHtml()    — HTML-escapes each variable value before insertion
 */

function randomUUID() {
  return globalThis.crypto.randomUUID();
}
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { v4NotificationTemplates } from "@/db/schema/v4NotificationTemplate";
import { DEFAULT_TEMPLATES, type DefaultTemplate } from "./defaultTemplates";

export type TemplateVars = Record<string, string | number | null | undefined>;

export type NotificationTemplateRow = {
  id: string;
  notificationType: string;
  category: string;
  emailSubject: string | null;
  emailTemplate: string | null;
  inAppTemplate: string | null;
  enabledEmail: boolean;
  enabledInApp: boolean;
  supportsEmail: boolean;
  supportsInApp: boolean;
  variables: string[] | null;
  updatedAt: Date | null;
  updatedBy: string | null;
};

// ── Rendering ────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Replace {{key}} tokens with plain-text values (no HTML escaping — for subjects + in-app). */
export function renderSubject(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = vars[key];
    if (val == null) return "";
    return String(val);
  });
}

/** Replace {{key}} tokens with HTML-escaped values (safe for use in email HTML bodies). */
export function renderHtml(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = vars[key];
    if (val == null) return "";
    return escapeHtml(String(val));
  });
}

// ── DB access ────────────────────────────────────────────────────────────────

export async function getTemplate(notificationType: string): Promise<NotificationTemplateRow | null> {
  try {
    const rows = await db
      .select()
      .from(v4NotificationTemplates)
      .where(eq(v4NotificationTemplates.notificationType, notificationType))
      .limit(1);
    return (rows[0] as NotificationTemplateRow | undefined) ?? null;
  } catch (err) {
    console.warn("[TEMPLATE_SERVICE] getTemplate failed — falling back to defaults", { notificationType, err });
    return null;
  }
}

export async function listTemplates(): Promise<NotificationTemplateRow[]> {
  try {
    const rows = await db
      .select()
      .from(v4NotificationTemplates)
      .orderBy(v4NotificationTemplates.category, v4NotificationTemplates.notificationType);
    return rows as NotificationTemplateRow[];
  } catch (err) {
    console.error("[TEMPLATE_SERVICE] listTemplates failed", err);
    return [];
  }
}

export async function upsertTemplate(
  adminId: string,
  data: {
    notificationType: string;
    category?: string;
    emailSubject?: string | null;
    emailTemplate?: string | null;
    inAppTemplate?: string | null;
    enabledEmail?: boolean;
    enabledInApp?: boolean;
    supportsEmail?: boolean;
    supportsInApp?: boolean;
    variables?: string[] | null;
  },
): Promise<NotificationTemplateRow> {
  const now = new Date();
  const existing = await getTemplate(data.notificationType);
  const def = DEFAULT_TEMPLATES[data.notificationType];

  if (existing) {
    await db
      .update(v4NotificationTemplates)
      .set({
        ...(data.category !== undefined && { category: data.category }),
        ...(data.emailSubject !== undefined && { emailSubject: data.emailSubject }),
        ...(data.emailTemplate !== undefined && { emailTemplate: data.emailTemplate }),
        ...(data.inAppTemplate !== undefined && { inAppTemplate: data.inAppTemplate }),
        ...(data.enabledEmail !== undefined && { enabledEmail: data.enabledEmail }),
        ...(data.enabledInApp !== undefined && { enabledInApp: data.enabledInApp }),
        ...(data.supportsEmail !== undefined && { supportsEmail: data.supportsEmail }),
        ...(data.supportsInApp !== undefined && { supportsInApp: data.supportsInApp }),
        ...(data.variables !== undefined && { variables: data.variables }),
        updatedAt: now,
        updatedBy: adminId,
      })
      .where(eq(v4NotificationTemplates.notificationType, data.notificationType));
  } else {
    await db.insert(v4NotificationTemplates).values({
      id: randomUUID(),
      notificationType: data.notificationType,
      category: data.category ?? def?.category ?? "System",
      emailSubject: data.emailSubject ?? def?.emailSubject ?? null,
      emailTemplate: data.emailTemplate ?? def?.emailTemplate ?? null,
      inAppTemplate: data.inAppTemplate ?? def?.inAppTemplate ?? null,
      enabledEmail: data.enabledEmail ?? true,
      enabledInApp: data.enabledInApp ?? true,
      supportsEmail: data.supportsEmail ?? def?.supportsEmail ?? true,
      supportsInApp: data.supportsInApp ?? def?.supportsInApp ?? true,
      variables: data.variables ?? def?.variables ?? null,
      updatedAt: now,
      updatedBy: adminId,
    });
  }

  const updated = await getTemplate(data.notificationType);
  return updated!;
}

export async function resetToDefault(
  adminId: string,
  notificationType: string,
): Promise<NotificationTemplateRow | null> {
  const def = DEFAULT_TEMPLATES[notificationType];
  if (!def) {
    console.warn("[TEMPLATE_SERVICE] No default found for", notificationType);
    return null;
  }
  return upsertTemplate(adminId, {
    notificationType,
    category: def.category,
    emailSubject: def.emailSubject ?? null,
    emailTemplate: def.emailTemplate ?? null,
    inAppTemplate: def.inAppTemplate ?? null,
    enabledEmail: true,
    enabledInApp: true,
    supportsEmail: def.supportsEmail,
    supportsInApp: def.supportsInApp,
    variables: def.variables,
  });
}

/** Seed all 9 priority templates from defaults into the DB. Safe to call on repeated deployments. */
export async function seedPriorityTemplates(adminId = "SYSTEM"): Promise<void> {
  const PRIORITY_TYPES = [
    "NEW_JOB_INVITE",
    "JOB_ROUTED",
    "CONTRACTOR_ACCEPTED",
    "FUNDS_RELEASED",
    "PAYMENT_RECEIVED",
    "SUPPORT_REPLY",
    "RE_APPRAISAL_REQUESTED",
    "RE_APPRAISAL_ACCEPTED",
    "RE_APPRAISAL_DECLINED",
  ];

  for (const type of PRIORITY_TYPES) {
    const existing = await getTemplate(type);
    if (!existing) {
      await resetToDefault(adminId, type);
      console.log(`[TEMPLATE_SERVICE] Seeded default template: ${type}`);
    }
  }
}

// ── 3-tier fallback resolution ────────────────────────────────────────────────

export type ResolvedTemplate = {
  emailSubject: string | null;
  emailTemplate: string | null;
  inAppTemplate: string | null;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  source: "db" | "default" | "none";
};

/**
 * Resolves the active template for a notification type using 3-tier fallback:
 *   1. DB template present + enabled → use it
 *   2. DB template present but disabled → honor disable
 *   3. DB template absent or broken → fall back to hardcoded default
 */
export async function resolveTemplate(notificationType: string): Promise<ResolvedTemplate> {
  let dbTpl: NotificationTemplateRow | null = null;
  try {
    dbTpl = await getTemplate(notificationType);
  } catch (err) {
    console.warn("[TEMPLATE_FALLBACK] DB read failed, using hardcoded default", { notificationType, err });
  }

  if (dbTpl) {
    return {
      emailSubject: dbTpl.emailSubject,
      emailTemplate: dbTpl.emailTemplate,
      inAppTemplate: dbTpl.inAppTemplate,
      emailEnabled: dbTpl.enabledEmail,
      inAppEnabled: dbTpl.enabledInApp,
      source: "db",
    };
  }

  const def: DefaultTemplate | undefined = DEFAULT_TEMPLATES[notificationType];
  if (def) {
    if (!dbTpl) {
      console.info("[TEMPLATE_FALLBACK] Using hardcoded default", { notificationType });
    }
    return {
      emailSubject: def.emailSubject ?? null,
      emailTemplate: def.emailTemplate ?? null,
      inAppTemplate: def.inAppTemplate ?? null,
      emailEnabled: true,
      inAppEnabled: true,
      source: "default",
    };
  }

  return {
    emailSubject: null,
    emailTemplate: null,
    inAppTemplate: null,
    emailEnabled: false,
    inAppEnabled: false,
    source: "none",
  };
}
