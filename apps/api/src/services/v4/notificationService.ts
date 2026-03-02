import {
  getPreferences,
  listNotifications,
  markNotificationReadById,
  sendNotification,
  updatePreferences,
  type NotificationRow,
} from "@/src/services/notifications/notificationService";
import type { NotificationPriority } from "@/src/services/v4/notifications/notificationTypes";

type CreateNotificationInput = {
  userId: string;
  role: string;
  type: string;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  priority?: NotificationPriority;
  read?: boolean;
};

export async function createNotification(input: CreateNotificationInput) {
  const created = await sendNotification({
    userId: input.userId,
    role: input.role,
    type: input.type,
    title: input.title,
    message: input.message,
    entityType: input.entityType,
    entityId: input.entityId,
    priority: input.priority,
  });

  if (input.read) {
    if (created?.id) {
      await markNotificationReadById(created.id, { userId: input.userId });
    }
  }

  return created;
}

export async function listNotificationsForUser(userId: string, priority?: string) {
  const listed = await listNotifications({ userId, priority, page: 1, pageSize: 200 });
  return listed.rows;
}

export async function markNotificationRead(id: string, userId: string) {
  return await markNotificationReadById(id, { userId });
}

export async function listRoleNotifications(input: {
  userId: string;
  role: string;
  unreadOnly?: boolean;
  page?: number;
  pageSize?: number;
  type?: string | null;
  entityType?: string | null;
}) {
  return listNotifications(input);
}

export async function getRoleNotificationPreferences(input: { userId: string; role: string }) {
  return getPreferences(input);
}

export async function updateRoleNotificationPreferences(input: {
  userId: string;
  role: string;
  items: Array<{ type: string; inApp?: boolean; email?: boolean }>;
}) {
  return updatePreferences(input);
}

export type { NotificationRow };
