import type { DomainEvent, DomainEventDispatchMode } from "./domainEventTypes";
import { notificationEventMapper } from "@/src/services/v4/notifications/notificationEventMapper";

export async function emitDomainEvent(
  event: DomainEvent,
  options?: { tx?: any; mode?: DomainEventDispatchMode },
): Promise<void> {
  console.log("[invite-accept-step] emitDomainEvent called", { type: event.type });
  await notificationEventMapper(event, options);
  console.log("[invite-accept-step] emitDomainEvent returned", { type: event.type });
}

