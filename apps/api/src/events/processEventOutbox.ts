/**
 * Processes pending events from the transactional outbox.
 * Runs outside business transactions so notification failures never break core operations.
 */
import { eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { v4EventOutbox } from "@/db/schema/v4EventOutbox";
import { notificationEventMapper } from "@/src/services/v4/notifications/notificationEventMapper";
import { seoEventHandler } from "@/src/services/seo/seoEventHandler";
import type { DomainEvent, DomainEventType } from "./domainEventTypes";

const BATCH_SIZE = 50;

/** Restore Date fields from JSON-serialized payload (createdAt etc.) */
function restorePayloadDates(payload: Record<string, unknown>): Record<string, unknown> {
  const out = { ...payload };
  if (out.createdAt && typeof out.createdAt === "string") {
    out.createdAt = new Date(out.createdAt);
  }
  return out;
}

export async function processEventOutbox(): Promise<void> {
  const events = await db
    .select()
    .from(v4EventOutbox)
    .where(isNull(v4EventOutbox.processedAt))
    .limit(BATCH_SIZE);

  for (const event of events) {
    try {
      const payload = restorePayloadDates(event.payload as Record<string, unknown>);
      const domainEvent = {
        type: event.eventType,
        payload,
      } as unknown as DomainEvent;

      await notificationEventMapper(domainEvent);
      await seoEventHandler(domainEvent);

      await db
        .update(v4EventOutbox)
        .set({ processedAt: new Date() })
        .where(eq(v4EventOutbox.id, event.id));

      console.log("[event-outbox] event processed", { id: event.id, type: event.eventType });
    } catch (err) {
      await db
        .update(v4EventOutbox)
        .set({ attempts: sql`${v4EventOutbox.attempts} + 1` })
        .where(eq(v4EventOutbox.id, event.id));

      console.warn("[event-outbox] event retry", {
        id: event.id,
        type: event.eventType,
        attempts: event.attempts + 1,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
