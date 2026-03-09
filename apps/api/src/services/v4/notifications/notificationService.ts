/** Use global Web Crypto API to avoid webpack/node resolution issues in instrumentation path */
function randomUUID(): string {
  return globalThis.crypto.randomUUID();
}
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { v4Notifications } from "@/db/schema/v4Notification";
import { v4NotificationPreferences } from "@/db/schema/v4NotificationPreference";
import { users } from "@/db/schema/user";
import {
  NOTIFICATION_TYPES,
  type NotificationPriority,
  type NotificationRole,
  type NotificationType,
  normalizeNotificationPriority,
  normalizeNotificationRole,
  normalizeNotificationType,
} from "./notificationTypes";
// Email delivery is handled by an internal API endpoint (/api/internal/send-notification-email)
// to keep nodemailer (and all Node.js-only mailer code) completely out of this file.
// This file is statically imported by the instrumentation chain (processEventOutbox →
// notificationEventMapper → notificationService), which is compiled for the edge runtime
// by Next.js. Any nodemailer reference here would appear in the edge bundle and fail
// Vercel's edge function validator.
async function lazyLogDelivery(data: Parameters<Awaited<typeof import("./notificationDeliveryLogService")>["logDelivery"]>[0]) {
  const { logDelivery } = await import("./notificationDeliveryLogService");
  return logDelivery(data);
}

type Executor = typeof db | any;

class NotificationSchemaError extends Error {
  code = "NOTIFICATION_SCHEMA_ERROR";
  status = 500;

  constructor(message: string) {
    super(message);
    this.name = "NotificationSchemaError";
  }
}

function isMissingPreferencesTableError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return code === "42P01" || /v4_notification_preferences/i.test(message);
}

function isMissingNotificationsDedupeColumnError(error: unknown): boolean {
  const root = error as { code?: string; message?: string; cause?: { code?: string; message?: string } } | null;
  const code = root?.code;
  const causeCode = root?.cause?.code;
  const message = [root?.message ?? String(error ?? ""), root?.cause?.message ?? ""].join(" ");
  if ((code === "42703" || causeCode === "42703") && /dedupe_key/i.test(message)) return true;
  return /insert into \"v4_notifications\"/i.test(message) && /dedupe_key/i.test(message);
}

function handleMissingPreferencesTable(error: unknown): never {
  const msg = "v4_notification_preferences table missing — migration required.";
  if (process.env.NODE_ENV === "production") {
    console.error("[NOTIFICATION_SCHEMA_ERROR]", {
      message: msg,
      dbError: error instanceof Error ? error.message : String(error),
    });
  }
  throw new NotificationSchemaError(msg);
}

let preferencesSchemaCheckPromise: Promise<void> | null = null;
let dedupeColumnCheckPromise: Promise<boolean> | null = null;

async function ensurePreferencesSchemaReady(exec: Executor): Promise<void> {
  if (preferencesSchemaCheckPromise) {
    return preferencesSchemaCheckPromise;
  }
  preferencesSchemaCheckPromise = (async () => {
    try {
      await exec.execute(sql`select 1 from ${v4NotificationPreferences} limit 1`);
    } catch (error) {
      preferencesSchemaCheckPromise = null;
      if (isMissingPreferencesTableError(error)) {
        handleMissingPreferencesTable(error);
      }
      throw error;
    }
  })();
  return preferencesSchemaCheckPromise;
}

async function hasNotificationsDedupeColumn(exec: Executor): Promise<boolean> {
  if (dedupeColumnCheckPromise) {
    return dedupeColumnCheckPromise;
  }
  dedupeColumnCheckPromise = (async () => {
    const res = await exec.execute(sql`
      select exists (
        select 1
        from information_schema.columns
        where table_schema = current_schema()
          and table_name = 'v4_notifications'
          and column_name = 'dedupe_key'
      ) as exists
    `);
    const rows = (res as { rows?: Array<{ exists?: boolean | string | number }> }).rows ?? [];
    return Boolean(rows[0]?.exists);
  })().catch((error) => {
    dedupeColumnCheckPromise = null;
    throw error;
  });
  return dedupeColumnCheckPromise;
}

type NotificationInsertBase = {
  id: string;
  userId: string;
  role: NotificationRole;
  type: NotificationType;
  title: string;
  message: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  read: boolean;
  readAt: Date | null;
  priority: NotificationPriority;
  createdAt: Date;
};

async function insertWithoutDedupeColumn(exec: Executor, values: NotificationInsertBase): Promise<NotificationRow | null> {
  await exec.execute(sql`
    insert into "v4_notifications" (
      "id",
      "user_id",
      "role",
      "type",
      "title",
      "message",
      "entity_type",
      "entity_id",
      "metadata",
      "read",
      "read_at",
      "priority",
      "created_at"
    ) values (
      ${values.id},
      ${values.userId},
      ${values.role},
      ${values.type},
      ${values.title},
      ${values.message},
      ${values.entityType},
      ${values.entityId},
      ${values.metadata},
      ${values.read},
      ${values.readAt},
      ${values.priority},
      ${values.createdAt}
    )
  `);
  const inserted = await exec
    .select(notificationSelect)
    .from(v4Notifications)
    .where(eq(v4Notifications.id, values.id))
    .limit(1);
  return (inserted[0] as NotificationRow | undefined) ?? null;
}

async function findByMetadataDedupe(exec: Executor, userId: string, dedupeKey: string): Promise<NotificationRow | null> {
  const rows = await exec
    .select(notificationSelect)
    .from(v4Notifications)
    .where(and(eq(v4Notifications.userId, userId), sql`${v4Notifications.metadata} ->> '_dedupeKey' = ${dedupeKey}`))
    .limit(1);
  return (rows[0] as NotificationRow | undefined) ?? null;
}

export type NotificationRow = {
  id: string;
  userId: string;
  role: string;
  type: string;
  title: string;
  message: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  read: boolean;
  readAt: Date | null;
  priority: NotificationPriority;
  createdAt: Date;
};

export type NotificationPreferenceRow = {
  id: string;
  userId: string;
  role: NotificationRole;
  notificationType: NotificationType;
  inApp: boolean;
  email: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const notificationSelect = {
  id: v4Notifications.id,
  userId: v4Notifications.userId,
  role: v4Notifications.role,
  type: v4Notifications.type,
  title: v4Notifications.title,
  message: v4Notifications.message,
  entityType: v4Notifications.entityType,
  entityId: v4Notifications.entityId,
  metadata: v4Notifications.metadata,
  read: v4Notifications.read,
  readAt: v4Notifications.readAt,
  priority: v4Notifications.priority,
  createdAt: v4Notifications.createdAt,
};

const preferenceSelect = {
  id: v4NotificationPreferences.id,
  userId: v4NotificationPreferences.userId,
  role: v4NotificationPreferences.role,
  notificationType: v4NotificationPreferences.notificationType,
  inApp: v4NotificationPreferences.inApp,
  email: v4NotificationPreferences.email,
  createdAt: v4NotificationPreferences.createdAt,
  updatedAt: v4NotificationPreferences.updatedAt,
};

function toTotal(value: unknown): number {
  const n = Number((value as any)?.count ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function getOrCreatePreference(
  exec: Executor,
  userId: string,
  role: NotificationRole,
  type: NotificationType,
): Promise<{ inApp: boolean; email: boolean }> {
  const existing = await exec
    .select(preferenceSelect)
    .from(v4NotificationPreferences)
    .where(
      and(
        eq(v4NotificationPreferences.userId, userId),
        eq(v4NotificationPreferences.role, role),
        eq(v4NotificationPreferences.notificationType, type),
      ),
    )
    .limit(1);
  if (existing[0]) {
    return {
      inApp: Boolean(existing[0].inApp),
      email: Boolean(existing[0].email),
    };
  }

  await exec
    .insert(v4NotificationPreferences)
    .values({
      id: randomUUID(),
      userId,
      role,
      notificationType: type,
      inApp: true,
      email: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [
        v4NotificationPreferences.userId,
        v4NotificationPreferences.role,
        v4NotificationPreferences.notificationType,
      ],
    });

  return { inApp: true, email: true };
}

export async function sendNotification(
  input: {
    id?: string;
    userId: string;
    role: string;
    type: string;
    title: string;
    message: string;
    entityType?: string | null;
    entityId?: string | null;
    priority?: NotificationPriority | string;
    metadata?: Record<string, unknown>;
    createdAt?: Date;
    dedupeKey?: string;
    idempotencyKey?: string;
  },
  tx?: Executor,
): Promise<NotificationRow | null> {
  try {
    const exec = tx ?? db;
    const userId = String(input.userId ?? "").trim();
    if (!userId) return null;

    await ensurePreferencesSchemaReady(exec);

    const role = normalizeNotificationRole(input.role);
    const type = normalizeNotificationType(input.type);
    const priority = normalizeNotificationPriority(input.priority);
    const pref = await getOrCreatePreference(exec, userId, role, type);
    if (!pref.inApp && !pref.email) return null;

    if (pref.email) {
      // Delegate email sending to the internal Node.js-only API endpoint.
      // Using fetch() keeps nodemailer and all mailer code out of this file —
      // this file is statically bundled into the edge/instrumentation context
      // and cannot reference nodemailer or any module that imports it.
      const apiOrigin = process.env.API_ORIGIN ?? "";
      if (apiOrigin) {
        void fetch(`${apiOrigin}/api/internal/send-notification-email`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-internal-key": process.env.INTERNAL_DEBUG_SECRET ?? "",
          },
          body: JSON.stringify({
            userId,
            notificationType: type,
            metadata: input.metadata ?? {},
            dedupeKey: input.dedupeKey ?? input.idempotencyKey ?? null,
            eventId: (input.metadata as any)?._eventId ?? null,
          }),
        }).catch((err) => console.error("[NOTIFICATION_EMAIL_TRIGGER_ERROR]", { type, userId, err: String(err) }));
      }
    }
    if (!pref.inApp) return null;
    const dedupeColumnAvailable = await hasNotificationsDedupeColumn(exec);
    const resolvedDedupeKey = input.dedupeKey ?? input.idempotencyKey ?? null;
    if (resolvedDedupeKey && !dedupeColumnAvailable) {
      const existingByMetadata = await findByMetadataDedupe(exec, userId, resolvedDedupeKey);
      if (existingByMetadata) return existingByMetadata;
    }

    const createdAt = input.createdAt ?? new Date();
    const notificationId = input.id ?? randomUUID();
    const valuesBase: NotificationInsertBase = {
      id: notificationId,
      userId,
      role,
      type,
      title: String(input.title ?? "").trim() || "Notification",
      message: String(input.message ?? "").trim() || "You have a new notification.",
      entityType: String(input.entityType ?? "SYSTEM").trim().toUpperCase() || "SYSTEM",
      entityId: input.entityId ?? notificationId,
      metadata:
        resolvedDedupeKey && !dedupeColumnAvailable
          ? { ...(input.metadata ?? {}), _dedupeKey: resolvedDedupeKey }
          : (input.metadata ?? {}),
      read: false,
      readAt: null,
      priority,
      createdAt,
    } as const;
    if (resolvedDedupeKey && dedupeColumnAvailable) {
      const values = { ...valuesBase, dedupeKey: resolvedDedupeKey };
      try {
        const inserted = await exec
          .insert(v4Notifications)
          .values(values)
          .onConflictDoNothing({ target: v4Notifications.dedupeKey })
          .returning(notificationSelect);
        if (inserted[0]) return inserted[0] as NotificationRow;

        const existing = await exec
          .select(notificationSelect)
          .from(v4Notifications)
          .where(eq(v4Notifications.dedupeKey, resolvedDedupeKey))
          .limit(1);
        return (existing[0] as NotificationRow | undefined) ?? null;
      } catch (error) {
        if (isMissingNotificationsDedupeColumnError(error)) {
          console.error("[NOTIFICATION_SCHEMA_ERROR]", {
            message: "v4_notifications.dedupe_key missing — falling back to insert without dedupe.",
          });
          return insertWithoutDedupeColumn(exec, valuesBase);
        }
        throw error;
      }
    }

    const row = await insertWithoutDedupeColumn(exec, valuesBase);
    if (row) {
      void lazyLogDelivery({
        notificationId: row.id,
        notificationType: type,
        recipientUserId: userId,
        channel: "IN_APP",
        status: "DELIVERED",
        dedupeKey: input.dedupeKey ?? input.idempotencyKey ?? null,
        eventId: (input.metadata as any)?._eventId ?? null,
      });
    }
    return row;
  } catch (error) {
    if (error instanceof NotificationSchemaError || isMissingPreferencesTableError(error)) {
      if (!(error instanceof NotificationSchemaError)) {
        handleMissingPreferencesTable(error);
      }
      throw error;
    }
    console.error("[NOTIFICATION_SEND_ERROR]", {
      userId: String(input.userId ?? ""),
      role: String(input.role ?? ""),
      type: String(input.type ?? ""),
      message: error instanceof Error ? error.message : String(error),
      code: (error as any)?.code,
    });
    if (tx) throw error;
    return null;
  }
}

export async function sendBulkNotifications(
  inputs: Array<Parameters<typeof sendNotification>[0]>,
  tx?: Executor,
): Promise<NotificationRow[]> {
  const out: NotificationRow[] = [];
  for (const input of inputs) {
    const row = await sendNotification(input, tx);
    if (row) out.push(row);
  }
  return out;
}

export async function listNotifications(input: {
  userId: string;
  role?: string | null;
  unreadOnly?: boolean;
  read?: boolean | null;
  priority?: string | null;
  type?: string | null;
  entityType?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: NotificationRow[]; totalCount: number; unreadCount: number; page: number; pageSize: number }> {
  const userId = String(input.userId ?? "").trim();
  const page = Math.max(1, Number(input.page ?? 1) || 1);
  const pageSize = Math.max(1, Math.min(200, Number(input.pageSize ?? 25) || 25));

  const scoped: any[] = [eq(v4Notifications.userId, userId)];
  if (input.role) scoped.push(eq(v4Notifications.role, normalizeNotificationRole(input.role)));

  const filters = [...scoped];
  if (input.unreadOnly) {
    filters.push(eq(v4Notifications.read, false));
  } else if (typeof input.read === "boolean") {
    filters.push(eq(v4Notifications.read, input.read));
  }
  if (input.priority) filters.push(eq(v4Notifications.priority, normalizeNotificationPriority(input.priority)));
  if (input.type) filters.push(eq(v4Notifications.type, normalizeNotificationType(input.type)));
  if (input.entityType) filters.push(eq(v4Notifications.entityType, String(input.entityType).toUpperCase()));

  const whereClause = filters.length ? and(...filters) : undefined;

  const rows = await db
    .select(notificationSelect)
    .from(v4Notifications)
    .where(whereClause)
    .orderBy(desc(v4Notifications.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(v4Notifications)
    .where(whereClause);

  const unreadWhere = and(...scoped, eq(v4Notifications.read, false));
  const unreadRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(v4Notifications)
    .where(unreadWhere);

  return {
    rows: rows as NotificationRow[],
    totalCount: toTotal(totalRows[0]),
    unreadCount: toTotal(unreadRows[0]),
    page,
    pageSize,
  };
}

export async function markRead(input: {
  userId: string;
  role?: string | null;
  ids?: string[];
}): Promise<{ updatedCount: number }> {
  const ids = Array.from(new Set((input.ids ?? []).map((id) => String(id).trim()).filter(Boolean)));
  if (ids.length === 0) return { updatedCount: 0 };
  const whereParts: any[] = [eq(v4Notifications.userId, input.userId), eq(v4Notifications.read, false)];
  if (input.role) whereParts.push(eq(v4Notifications.role, normalizeNotificationRole(input.role)));
  whereParts.push(inArray(v4Notifications.id, ids));

  const updated = await db
    .update(v4Notifications)
    .set({ read: true, readAt: new Date() })
    .where(and(...whereParts))
    .returning({ id: v4Notifications.id });

  return { updatedCount: updated.length };
}

export async function markAllRead(input: {
  userId: string;
  role?: string | null;
}): Promise<{ updatedCount: number }> {
  const whereParts: any[] = [eq(v4Notifications.userId, input.userId), eq(v4Notifications.read, false)];
  if (input.role) whereParts.push(eq(v4Notifications.role, normalizeNotificationRole(input.role)));

  const updated = await db
    .update(v4Notifications)
    .set({ read: true, readAt: new Date() })
    .where(and(...whereParts))
    .returning({ id: v4Notifications.id });

  return { updatedCount: updated.length };
}

export async function markNotificationReadById(
  id: string,
  scope?: { userId?: string | null; role?: string | null },
): Promise<NotificationRow | null> {
  const whereParts: any[] = [eq(v4Notifications.id, id)];
  if (scope?.userId) whereParts.push(eq(v4Notifications.userId, scope.userId));
  if (scope?.role) whereParts.push(eq(v4Notifications.role, normalizeNotificationRole(scope.role)));

  const updated = await db
    .update(v4Notifications)
    .set({ read: true, readAt: new Date() })
    .where(and(...whereParts))
    .returning(notificationSelect);

  return (updated[0] as NotificationRow | undefined) ?? null;
}

export async function getPreferences(input: {
  userId: string;
  role: string;
}): Promise<{ items: Array<{ type: NotificationType; inApp: boolean; email: boolean }> }> {
  const userId = String(input.userId ?? "").trim();
  const role = normalizeNotificationRole(input.role);

  const rows = await db
    .select(preferenceSelect)
    .from(v4NotificationPreferences)
    .where(and(eq(v4NotificationPreferences.userId, userId), eq(v4NotificationPreferences.role, role)));

  const byType = new Map<string, { inApp: boolean; email: boolean }>();
  for (const row of rows) {
    const type = normalizeNotificationType(row.notificationType);
    byType.set(type, { inApp: Boolean(row.inApp), email: Boolean(row.email) });
  }

  const missingTypes = NOTIFICATION_TYPES.filter((type) => !byType.has(type));
  if (missingTypes.length > 0) {
    const now = new Date();
    await db
      .insert(v4NotificationPreferences)
      .values(
        missingTypes.map((type) => ({
          id: randomUUID(),
          userId,
          role,
          notificationType: type,
          inApp: true,
          email: true,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .onConflictDoNothing({
        target: [
          v4NotificationPreferences.userId,
          v4NotificationPreferences.role,
          v4NotificationPreferences.notificationType,
        ],
      });
    for (const type of missingTypes) byType.set(type, { inApp: true, email: true });
  }

  return {
    items: NOTIFICATION_TYPES.map((type) => ({
      type,
      inApp: byType.get(type)?.inApp ?? true,
      email: byType.get(type)?.email ?? true,
    })),
  };
}

export async function updatePreferences(input: {
  userId: string;
  role: string;
  items: Array<{ type: string; inApp?: boolean; email?: boolean }>;
}): Promise<{ items: Array<{ type: NotificationType; inApp: boolean; email: boolean }> }> {
  const userId = String(input.userId ?? "").trim();
  const role = normalizeNotificationRole(input.role);
  const now = new Date();

  for (const item of input.items) {
    const type = normalizeNotificationType(item.type);
    await db
      .insert(v4NotificationPreferences)
      .values({
        id: randomUUID(),
        userId,
        role,
        notificationType: type,
        inApp: item.inApp ?? true,
        email: item.email ?? true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          v4NotificationPreferences.userId,
          v4NotificationPreferences.role,
          v4NotificationPreferences.notificationType,
        ],
        set: {
          inApp: item.inApp ?? true,
          email: item.email ?? true,
          updatedAt: now,
        },
      });
  }

  return getPreferences({ userId, role });
}
