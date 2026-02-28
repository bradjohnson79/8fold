import { randomUUID } from "crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { admins } from "@/db/schema/admin";
import { v4Notifications } from "@/db/schema/v4Notification";

export type NotificationPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

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

function normEnum(value: string | null | undefined, fallback: string): string {
  const raw = String(value ?? "").trim().toUpperCase();
  return raw || fallback;
}

function toPriority(value: string | null | undefined): NotificationPriority {
  const normalized = normEnum(value, "NORMAL");
  if (normalized === "LOW" || normalized === "NORMAL" || normalized === "HIGH" || normalized === "CRITICAL") {
    return normalized;
  }
  return "NORMAL";
}

function toTotal(value: unknown): number {
  const n = Number((value as any)?.count ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function createNotification(
  input: {
    id?: string;
    userId: string;
    role?: string;
    type: string;
    title: string;
    message: string;
    entityType: string;
    entityId?: string | null;
    priority?: NotificationPriority;
    metadata?: Record<string, unknown>;
    createdAt?: Date;
    idempotencyKey?: string;
  },
  tx?: Executor,
): Promise<NotificationRow> {
  const exec = tx ?? db;
  const createdAt = input.createdAt ?? new Date();
  const values = {
    id: input.id ?? randomUUID(),
    userId: input.userId,
    role: normEnum(input.role, "SYSTEM"),
    type: normEnum(input.type, "SYSTEM_ALERT"),
    title: input.title,
    message: input.message,
    entityType: normEnum(input.entityType, "SYSTEM"),
    entityId: input.entityId ?? null,
    metadata: input.metadata ?? {},
    read: false,
    readAt: null,
    priority: toPriority(input.priority),
    dedupeKey: input.idempotencyKey ?? null,
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
    if (existing[0]) return existing[0] as NotificationRow;
  }

  const inserted = await exec.insert(v4Notifications).values(values).returning(notificationSelect);
  return inserted[0] as NotificationRow;
}

export async function createAdminNotifications(
  input: {
    type: string;
    title: string;
    message: string;
    entityType: string;
    entityId?: string | null;
    priority?: NotificationPriority;
    metadata?: Record<string, unknown>;
    createdAt?: Date;
    idempotencyKey?: string;
  },
  tx?: Executor,
): Promise<NotificationRow[]> {
  const exec = tx ?? db;
  const adminRows = await exec
    .select({ id: admins.id })
    .from(admins)
    .where(isNull(admins.disabledAt));

  if (!adminRows.length) return [];

  const created: NotificationRow[] = [];
  for (const adminRow of adminRows) {
    const row = await createNotification(
      {
        userId: String(adminRow.id),
        role: "ADMIN",
        type: input.type,
        title: input.title,
        message: input.message,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        priority: input.priority ?? "NORMAL",
        metadata: input.metadata ?? {},
        createdAt: input.createdAt,
        idempotencyKey: input.idempotencyKey
          ? `${input.idempotencyKey}:admin:${String(adminRow.id)}`
          : undefined,
      },
      exec,
    );
    created.push(row);
  }

  return created;
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
  const page = Math.max(1, Number(input.page ?? 1) || 1);
  const pageSize = Math.max(1, Math.min(200, Number(input.pageSize ?? 25) || 25));

  const scoped: any[] = [eq(v4Notifications.userId, input.userId)];
  if (input.role) scoped.push(eq(v4Notifications.role, normEnum(input.role, "SYSTEM")));

  const filters = [...scoped];
  if (input.unreadOnly) {
    filters.push(eq(v4Notifications.read, false));
  } else if (typeof input.read === "boolean") {
    filters.push(eq(v4Notifications.read, input.read));
  }
  if (input.priority) filters.push(eq(v4Notifications.priority, normEnum(input.priority, "NORMAL")));
  if (input.type) filters.push(eq(v4Notifications.type, normEnum(input.type, "SYSTEM_ALERT")));
  if (input.entityType) filters.push(eq(v4Notifications.entityType, normEnum(input.entityType, "SYSTEM")));

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

export async function markNotificationsRead(input: {
  userId: string;
  role?: string | null;
  ids?: string[];
  markAll?: boolean;
}): Promise<{ updatedCount: number }> {
  const ids = Array.from(new Set((input.ids ?? []).map((id) => String(id).trim()).filter(Boolean)));
  const markAll = input.markAll === true;
  if (!markAll && ids.length === 0) return { updatedCount: 0 };

  const whereParts: any[] = [eq(v4Notifications.userId, input.userId), eq(v4Notifications.read, false)];
  if (input.role) whereParts.push(eq(v4Notifications.role, normEnum(input.role, "SYSTEM")));
  if (!markAll) whereParts.push(inArray(v4Notifications.id, ids));

  const now = new Date();
  const updated = await db
    .update(v4Notifications)
    .set({ read: true, readAt: now })
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
  if (scope?.role) whereParts.push(eq(v4Notifications.role, normEnum(scope.role, "SYSTEM")));

  const now = new Date();
  const updated = await db
    .update(v4Notifications)
    .set({ read: true, readAt: now })
    .where(and(...whereParts))
    .returning(notificationSelect);

  return (updated[0] as NotificationRow | undefined) ?? null;
}
