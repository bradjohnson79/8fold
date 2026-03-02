import { describe, expect, test } from "vitest";
import { DOMAIN_EVENT_TYPES } from "@/src/events/domainEventTypes";
import { MAPPED_DOMAIN_EVENT_TYPES } from "@/src/events/domainEventRegistry";

describe("domain event coverage", () => {
  test("every domain event type is handled by notificationEventMapper", () => {
    const defined = new Set(DOMAIN_EVENT_TYPES);
    const mapped = new Set(MAPPED_DOMAIN_EVENT_TYPES);
    expect([...defined].sort()).toEqual([...mapped].sort());
  });
});
