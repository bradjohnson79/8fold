import { randomUUID } from "crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { v4Notifications } from "@/db/schema/v4Notification";
import { v4NotificationPreferences } from "@/db/schema/v4NotificationPreference";
import {
  NOTIFICATION_TYPES,
  type NotificationPriority,
  type NotificationRole,
  type NotificationType,
  normalizeNotificationPriority,
  normalizeNotificationRole,
  normalizeNotificationType,
} from "./notificationTypes";

type Executor = typeof db | any;

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

    const role = normalizeNotificationRole(input.role);
    const type = normalizeNotificationType(input.type);
    const priority = normalizeNotificationPriority(input.priority);
    const pref = await getOrCreatePreference(exec, userId, role, type);
    if (!pref.inApp && !pref.email) return null;

    if (pref.email) {
      console.info("[NOTIFICATION_EMAIL_INTENT]", { userId, role, type });
    }
    if (!pref.inApp) return null;

    const createdAt = input.createdAt ?? new Date();
    const values = {
      id: input.id ?? randomUUID(),
      userId,
      role,
      type,
      title: String(input.title ?? "").trim() || "Notification",
      message: String(input.message ?? "").trim() || "You have a new notification.",
      entityType: String(input.entityType ?? "SYSTEM").trim().toUpperCase() || "SYSTEM",
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? {},
      read: false,
      readAt: null,
      priority,
      dedupeKey: input.dedupeKey ?? input.idempotencyKey ?? null,
      createdAt,
    } as const;

    if (values.dedupeKey) {
      const inserted = await exec
        .insert(v4Notifications)
        .values(values)
        .onConflictDoNothing({ target: v4Notifications.dedupeKey })
        .returning(notificationSelect);
      if (inserted[0]) return inserted[0] as NotificationRow;

      const existing = await exec
        .select(notificationSelect)
        .from(v4Notifications)
        .where(eq(v4Notifications.dedupeKey, values.dedupeKey))
        .limit(1);
      return (existing[0] as NotificationRow | undefined) ?? null;
    }

    const inserted = await exec.insert(v4Notifications).values(values).returning(notificationSelect);
    return (inserted[0] as NotificationRow | undefined) ?? null;
  } catch (error) {
    console.error("[NOTIFICATION_SEND_ERROR]", {
      userId: String(input.userId ?? ""),
      role: String(input.role ?? ""),
      type: String(input.type ?? ""),
      message: error instanceof Error ? error.message : String(error),
    });
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
