import {
  createNotification as createCanonicalNotification,
  listNotifications,
  markNotificationReadById,
  type NotificationPriority,
} from "@/src/services/notifications/notificationService";

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
  const created = await createCanonicalNotification({
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
    await markNotificationReadById(created.id, { userId: input.userId });
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
