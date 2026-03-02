import type { DomainEvent, DomainEventDispatchMode } from "./domainEventTypes";
import { notificationEventMapper } from "@/src/services/v4/notifications/notificationEventMapper";

export async function emitDomainEvent(
  event: DomainEvent,
  options?: { tx?: any; mode?: DomainEventDispatchMode },
): Promise<void> {
  await notificationEventMapper(event, options);
}

