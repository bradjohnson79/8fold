import { isNull } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { admins } from "@/db/schema/admin";
import {
  getPreferences,
  listNotifications,
  markAllRead,
  markNotificationReadById,
  markRead,
  sendBulkNotifications,
  sendNotification,
  updatePreferences,
  type NotificationRow,
} from "@/src/services/v4/notifications/notificationService";
import type { NotificationPriority } from "@/src/services/v4/notifications/notificationTypes";

type Executor = typeof db | any;

export { listNotifications, markNotificationReadById, getPreferences, updatePreferences, sendNotification };
export type { NotificationRow };
export type { NotificationPriority } from "@/src/services/v4/notifications/notificationTypes";

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
): Promise<NotificationRow | null> {
  return await sendNotification(
    {
      id: input.id,
      userId: input.userId,
      role: input.role ?? "ADMIN",
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      priority: input.priority,
      metadata: input.metadata ?? {},
      createdAt: input.createdAt,
      idempotencyKey: input.idempotencyKey,
    },
    tx,
  );
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
  return sendBulkNotifications(
    adminRows.map((adminRow: { id: string }) => ({
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
    })),
    exec,
  );
}

export async function markNotificationsRead(input: {
  userId: string;
  role?: string | null;
  ids?: string[];
  markAll?: boolean;
}): Promise<{ updatedCount: number }> {
  if (input.markAll) {
    return markAllRead({
      userId: input.userId,
      role: input.role ?? null,
    });
  }
  return markRead({
    userId: input.userId,
    role: input.role ?? null,
    ids: input.ids ?? [],
  });
}
