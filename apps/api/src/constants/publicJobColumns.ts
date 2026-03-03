/**
 * Canonical ordered columns for public job discovery.
 * Public endpoints must use strict projection - only these columns.
 * Prevents schema drift from breaking the homepage.
 */
export const PUBLIC_JOB_COLUMNS = [
  "id",
  "title",
  "scope",
  "trade_category",
  "status",
  "routing_status",
  "region",
  "region_name",
  "region_code",
  "city",
  "photo_urls",
  "amount_cents",
  "currency",
  "router_earnings_cents",
  "contractor_payout_cents",
  "broker_fee_cents",
  "published_at",
  "created_at",
] as const;

export type PublicJobColumn = (typeof PUBLIC_JOB_COLUMNS)[number];
