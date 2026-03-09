/**
 * Notification Delivery Log Service
 *
 * Tracks every email and in-app notification delivery attempt.
 * logDelivery() is designed to never throw — it swallows all errors so it
 * cannot interfere with the notification delivery path.
 */

function randomUUID() {
  return globalThis.crypto.randomUUID();
}
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { v4NotificationDeliveryLogs } from "@/db/schema/v4NotificationDeliveryLog";

export type LogDeliveryInput = {
  notificationId?: string | null;
  notificationType: string;
  recipientUserId: string;
  recipientEmail?: string | null;
  channel: "EMAIL" | "IN_APP";
  status: "DELIVERED" | "FAILED" | "SKIPPED";
  errorMessage?: string | null;
  eventId?: string | null;
  dedupeKey?: string | null;
  isTest?: boolean;
  metadata?: Record<string, unknown> | null;
};

export type DeliveryLogRow = {
  id: string;
  notificationId: string | null;
  notificationType: string;
  recipientUserId: string;
  recipientEmail: string | null;
  channel: string;
  status: string;
  errorMessage: string | null;
  eventId: string | null;
  dedupeKey: string | null;
  isTest: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

export async function logDelivery(input: LogDeliveryInput): Promise<void> {
  try {
    await db.insert(v4NotificationDeliveryLogs).values({
      id: randomUUID(),
      notificationId: input.notificationId ?? null,
      notificationType: input.notificationType,
      recipientUserId: input.recipientUserId,
      recipientEmail: input.recipientEmail ?? null,
      channel: input.channel,
      status: input.status,
      errorMessage: input.errorMessage ?? null,
      eventId: input.eventId ?? null,
      dedupeKey: input.dedupeKey ?? null,
      isTest: input.isTest ?? false,
      metadata: input.metadata ?? null,
    });
  } catch (err) {
    // Never propagate — delivery logging must not break notification delivery
    console.error("[DELIVERY_LOG] Failed to log delivery", {
      notificationType: input.notificationType,
      recipientUserId: input.recipientUserId,
      channel: input.channel,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export type ListDeliveryLogsInput = {
  page?: number;
  pageSize?: number;
  channel?: string | null;
  status?: string | null;
  notificationType?: string | null;
  recipientUserId?: string | null;
  since?: Date | null;
  until?: Date | null;
  /** Default: false — test records are hidden unless explicitly requested */
  isTest?: boolean | null;
};

export async function listDeliveryLogs(input: ListDeliveryLogsInput = {}): Promise<{
  rows: DeliveryLogRow[];
  totalCount: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, Number(input.page ?? 1) || 1);
  const pageSize = Math.max(1, Math.min(200, Number(input.pageSize ?? 50) || 50));
  const offset = (page - 1) * pageSize;

  const filters: ReturnType<typeof eq>[] = [];

  if (input.channel) {
    filters.push(eq(v4NotificationDeliveryLogs.channel, input.channel));
  }
  if (input.status) {
    filters.push(eq(v4NotificationDeliveryLogs.status, input.status));
  }
  if (input.notificationType) {
    filters.push(eq(v4NotificationDeliveryLogs.notificationType, input.notificationType));
  }
  if (input.recipientUserId) {
    filters.push(eq(v4NotificationDeliveryLogs.recipientUserId, input.recipientUserId));
  }
  if (input.since) {
    filters.push(gte(v4NotificationDeliveryLogs.createdAt, input.since));
  }
  if (input.until) {
    filters.push(lte(v4NotificationDeliveryLogs.createdAt, input.until));
  }

  // isTest defaults to false — hide test records unless explicitly requested
  const showTest = input.isTest === true;
  if (!showTest) {
    filters.push(eq(v4NotificationDeliveryLogs.isTest, false));
  } else if (input.isTest === true) {
    filters.push(eq(v4NotificationDeliveryLogs.isTest, true));
  }

  const where = filters.length > 0 ? and(...filters) : undefined;

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(v4NotificationDeliveryLogs)
      .where(where)
      .orderBy(desc(v4NotificationDeliveryLogs.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: v4NotificationDeliveryLogs.id })
      .from(v4NotificationDeliveryLogs)
      .where(where),
  ]);

  return {
    rows: rows as DeliveryLogRow[],
    totalCount: countResult.length,
    page,
    pageSize,
  };
}
