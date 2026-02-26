import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { v4Notifications } from "@/db/schema/v4Notification";

export type NotificationPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

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

async function maybeSendClerkEmail(input: CreateNotificationInput): Promise<void> {
  const enabled = String(process.env.ADMIN_V4_CLERK_EMAIL_ENABLED ?? "").trim().toLowerCase() === "true";
  const webhookUrl = String(process.env.ADMIN_V4_CLERK_EMAIL_WEBHOOK_URL ?? "").trim();
  if (!enabled || !webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: input.userId,
        role: input.role,
        type: input.type,
        title: input.title,
        message: input.message,
        entityType: input.entityType,
        entityId: input.entityId,
        priority: input.priority ?? "NORMAL",
      }),
    });
  } catch (e) {
    console.error("[V4_NOTIFICATION_CLERK_EMAIL_FAILED]", {
      message: e instanceof Error ? e.message : String(e),
      userId: input.userId,
      type: input.type,
    });
  }
}

export async function createNotification(input: CreateNotificationInput) {
  const rows = await db
    .insert(v4Notifications)
    .values({
      id: randomUUID(),
      userId: input.userId,
      role: input.role,
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: input.entityType,
      entityId: input.entityId,
      read: input.read ?? false,
      priority: input.priority ?? "NORMAL",
      createdAt: new Date(),
    })
    .returning();

  // Non-blocking best-effort.
  void maybeSendClerkEmail(input);

  return rows[0] ?? null;
}

export async function listNotificationsForUser(userId: string, priority?: string) {
  const where = [] as any[];
  where.push(eq(v4Notifications.userId, userId));
  if (priority) where.push(eq(v4Notifications.priority, priority));

  const rows = await db
    .select()
    .from(v4Notifications)
    .where(and(...where))
    .orderBy(desc(v4Notifications.createdAt))
    .limit(200);

  return rows;
}

export async function markNotificationRead(id: string, userId: string) {
  const rows = await db
    .update(v4Notifications)
    .set({ read: true })
    .where(and(eq(v4Notifications.id, id), eq(v4Notifications.userId, userId)))
    .returning();

  return rows[0] ?? null;
}
