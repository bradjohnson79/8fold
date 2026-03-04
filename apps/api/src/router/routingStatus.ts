/**
 * Canonical routing_status lifecycle constants.
 * Use these instead of raw strings. Queries treat INVITES_SENT and ROUTED_BY_ROUTER as equivalent for backward compatibility.
 */
export const ROUTING_STATUS = {
  UNROUTED: "UNROUTED",
  INVITES_SENT: "INVITES_SENT",
  INVITE_ACCEPTED: "INVITE_ACCEPTED",
  INVITES_EXPIRED: "INVITES_EXPIRED",
  ROUTED_BY_ROUTER: "ROUTED_BY_ROUTER",
  ROUTED_BY_ADMIN: "ROUTED_BY_ADMIN",
} as const;

export type RoutingStatus = (typeof ROUTING_STATUS)[keyof typeof ROUTING_STATUS];
