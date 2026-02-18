/**
 * Single source of truth for which Job.status values are allowed to appear
 * in public discovery endpoints (homepage + location pickers).
 *
 * IMPORTANT:
 * - These values must exist in the Postgres enum "JobStatus".
 * - If you need a new status (e.g. CUSTOMER_APPROVED_AWAITING_ROUTER), add it to the DB
 *   enum first via an additive migration, then include it here.
 */
export const PUBLIC_VISIBLE_STATUSES = [
  // Public selector + homepage should only show jobs actively in routing.
  "ASSIGNED",
  // Used with additional predicate: routerApprovedAt IS NULL to represent
  // "CUSTOMER_APPROVED_AWAITING_ROUTER" (UI-level filter, not a DB enum).
  "CUSTOMER_APPROVED",
] as const;

