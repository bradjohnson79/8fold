ALTER TABLE IF EXISTS "public"."v4_admin_users"
  ADD COLUMN IF NOT EXISTS "name" text,
  ADD COLUMN IF NOT EXISTS "phone" text,
  ADD COLUMN IF NOT EXISTS "country" text,
  ADD COLUMN IF NOT EXISTS "state" text,
  ADD COLUMN IF NOT EXISTS "city" text,
  ADD COLUMN IF NOT EXISTS "first_name" text,
  ADD COLUMN IF NOT EXISTS "last_name" text,
  ADD COLUMN IF NOT EXISTS "suspended_until" timestamptz,
  ADD COLUMN IF NOT EXISTS "suspension_reason" text,
  ADD COLUMN IF NOT EXISTS "archived_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "archived_reason" text;

CREATE TABLE IF NOT EXISTS "public"."v4_admin_jobs" (
  "id" text PRIMARY KEY NOT NULL,
  "status" text NOT NULL,
  "title" text NOT NULL,
  "country" text NOT NULL,
  "province" text,
  "city" text,
  "address" text,
  "trade" text NOT NULL,
  "job_source" text NOT NULL DEFAULT 'REAL',
  "routing_status" text NOT NULL DEFAULT 'UNROUTED',
  "archived" boolean NOT NULL DEFAULT false,
  "assignment_id" text,
  "assignment_status" text,
  "assignment_contractor_id" text,
  "assignment_contractor_name" text,
  "assignment_contractor_email" text,
  "amount_cents" integer NOT NULL DEFAULT 0,
  "payment_status" text NOT NULL DEFAULT 'UNPAID',
  "payout_status" text NOT NULL DEFAULT 'NOT_READY',
  "created_at" timestamptz NOT NULL,
  "published_at" timestamptz,
  "updated_at" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "v4_admin_jobs_status_idx" ON "public"."v4_admin_jobs" ("status");
CREATE INDEX IF NOT EXISTS "v4_admin_jobs_country_province_idx" ON "public"."v4_admin_jobs" ("country", "province");
CREATE INDEX IF NOT EXISTS "v4_admin_jobs_trade_idx" ON "public"."v4_admin_jobs" ("trade");
CREATE INDEX IF NOT EXISTS "v4_admin_jobs_created_at_idx" ON "public"."v4_admin_jobs" ("created_at");

CREATE TABLE IF NOT EXISTS "public"."v4_admin_payout_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "user_email" text,
  "user_role" text,
  "amount_cents" integer NOT NULL,
  "status" text NOT NULL,
  "payout_id" text,
  "created_at" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "v4_admin_payout_requests_status_idx" ON "public"."v4_admin_payout_requests" ("status");
CREATE INDEX IF NOT EXISTS "v4_admin_payout_requests_created_at_idx" ON "public"."v4_admin_payout_requests" ("created_at");
CREATE INDEX IF NOT EXISTS "v4_admin_payout_requests_user_idx" ON "public"."v4_admin_payout_requests" ("user_id");

CREATE TABLE IF NOT EXISTS "public"."v4_admin_transfers" (
  "id" text PRIMARY KEY NOT NULL,
  "job_id" text NOT NULL,
  "role" text NOT NULL,
  "user_id" text NOT NULL,
  "user_email" text,
  "user_name" text,
  "amount_cents" integer NOT NULL,
  "currency" text NOT NULL,
  "method" text NOT NULL,
  "stripe_transfer_id" text,
  "external_ref" text,
  "status" text NOT NULL,
  "failure_reason" text,
  "job_title" text,
  "created_at" timestamptz NOT NULL,
  "released_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "v4_admin_transfers_status_idx" ON "public"."v4_admin_transfers" ("status");
CREATE INDEX IF NOT EXISTS "v4_admin_transfers_created_at_idx" ON "public"."v4_admin_transfers" ("created_at");
CREATE INDEX IF NOT EXISTS "v4_admin_transfers_user_idx" ON "public"."v4_admin_transfers" ("user_id");

CREATE TABLE IF NOT EXISTS "public"."v4_admin_disputes" (
  "id" text PRIMARY KEY NOT NULL,
  "ticket_id" text NOT NULL,
  "job_id" text NOT NULL,
  "filed_by_user_id" text NOT NULL,
  "against_user_id" text NOT NULL,
  "against_role" text NOT NULL,
  "dispute_reason" text NOT NULL,
  "description" text NOT NULL,
  "status" text NOT NULL,
  "decision" text,
  "decision_summary" text,
  "decision_at" timestamptz,
  "deadline_at" timestamptz NOT NULL,
  "ticket_subject" text,
  "ticket_priority" text,
  "ticket_category" text,
  "ticket_status" text,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "v4_admin_disputes_status_idx" ON "public"."v4_admin_disputes" ("status");
CREATE INDEX IF NOT EXISTS "v4_admin_disputes_created_at_idx" ON "public"."v4_admin_disputes" ("created_at");
CREATE INDEX IF NOT EXISTS "v4_admin_disputes_job_idx" ON "public"."v4_admin_disputes" ("job_id");

CREATE TABLE IF NOT EXISTS "public"."v4_admin_support_tickets" (
  "id" text PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "status" text NOT NULL,
  "category" text NOT NULL,
  "priority" text NOT NULL,
  "role_context" text NOT NULL,
  "subject" text NOT NULL,
  "created_by_id" text NOT NULL,
  "assigned_to_id" text,
  "message_count" integer NOT NULL DEFAULT 0,
  "last_message_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "v4_admin_support_tickets_status_idx" ON "public"."v4_admin_support_tickets" ("status");
CREATE INDEX IF NOT EXISTS "v4_admin_support_tickets_created_at_idx" ON "public"."v4_admin_support_tickets" ("created_at");
CREATE INDEX IF NOT EXISTS "v4_admin_support_tickets_priority_idx" ON "public"."v4_admin_support_tickets" ("priority");

CREATE TABLE IF NOT EXISTS "public"."v4_admin_integrity_alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "type" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'MEDIUM',
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "message" text NOT NULL,
  "status" text NOT NULL DEFAULT 'OPEN',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "resolved_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "v4_admin_integrity_alerts_status_idx" ON "public"."v4_admin_integrity_alerts" ("status");
CREATE INDEX IF NOT EXISTS "v4_admin_integrity_alerts_created_at_idx" ON "public"."v4_admin_integrity_alerts" ("created_at");
CREATE INDEX IF NOT EXISTS "v4_admin_integrity_alerts_severity_idx" ON "public"."v4_admin_integrity_alerts" ("severity");

CREATE TABLE IF NOT EXISTS "public"."v4_admin_payout_adjustments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "admin_id" text NOT NULL,
  "user_id" text NOT NULL,
  "direction" text NOT NULL,
  "bucket" text NOT NULL,
  "amount_cents" integer NOT NULL,
  "memo" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "v4_admin_payout_adjustments_user_idx" ON "public"."v4_admin_payout_adjustments" ("user_id");
CREATE INDEX IF NOT EXISTS "v4_admin_payout_adjustments_created_at_idx" ON "public"."v4_admin_payout_adjustments" ("created_at");

CREATE TABLE IF NOT EXISTS "public"."v4_admin_sync_checkpoints" (
  "key" text PRIMARY KEY NOT NULL,
  "last_synced_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
