CREATE TABLE IF NOT EXISTS "public"."v4_notification_preferences" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "role" text NOT NULL,
  "notification_type" text NOT NULL,
  "in_app" boolean NOT NULL DEFAULT true,
  "email" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "v4_notification_preferences_user_role_idx"
  ON "public"."v4_notification_preferences" ("user_id", "role");

CREATE UNIQUE INDEX IF NOT EXISTS "v4_notification_preferences_user_role_type_uq"
  ON "public"."v4_notification_preferences" ("user_id", "role", "notification_type");

WITH notification_types AS (
  SELECT unnest(ARRAY[
    'NEW_JOB_INVITE',
    'INVITE_EXPIRED',
    'JOB_ASSIGNED',
    'POSTER_ACCEPTED',
    'APPOINTMENT_BOOKED',
    'RESCHEDULE_REQUEST',
    'JOB_CANCELLED_BY_CUSTOMER',
    'BREACH_PENALTY_APPLIED',
    'SUSPENSION_APPLIED',
    'PAYMENT_RELEASED',
    'CONTRACTOR_ACCEPTED',
    'ASSIGNED_CONTRACTOR_EXPIRED',
    'RESCHEDULE_ACCEPTED',
    'CONTRACTOR_CANCELLED',
    'JOB_PUBLISHED',
    'REFUND_PROCESSED',
    'ROUTING_EXPIRED_NO_ACCEPT',
    'MESSAGE_RECEIVED',
    'JOB_REJECTED',
    'JOB_ROUTED',
    'ROUTING_WINDOW_EXPIRED',
    'JOB_RESET_TO_QUEUE',
    'ROUTER_COMPENSATION_PROCESSED',
    'JOB_CANCELLED_WITHIN_8H',
    'CONTRACTOR_SUSPENDED',
    'PAYMENT_EXCEPTION',
    'DISPUTE_OPENED',
    'HIGH_VALUE_JOB_CANCELLED',
    'SYSTEM_ERROR_EVENT',
    'CONTRACTOR_COMPLETED_JOB',
    'FUNDS_RELEASED',
    'NEW_MESSAGE',
    'JOB_REFUNDED',
    'PAYMENT_RECEIVED',
    'ROUTE_INVITE',
    'SYSTEM_ALERT'
  ]) AS type
),
user_targets AS (
  SELECT
    u."id"::text AS user_id,
    upper(coalesce(u."role"::text, ''))::text AS role
  FROM "public"."User" u
  WHERE upper(coalesce(u."role"::text, '')) IN ('CONTRACTOR', 'JOB_POSTER', 'ROUTER', 'ADMIN')

  UNION

  SELECT
    a."id"::text AS user_id,
    'ADMIN'::text AS role
  FROM "public"."admins" a
  WHERE a."disabled_at" IS NULL
)
INSERT INTO "public"."v4_notification_preferences" (
  "id",
  "user_id",
  "role",
  "notification_type",
  "in_app",
  "email",
  "created_at",
  "updated_at"
)
SELECT
  concat('npr_', md5(random()::text || clock_timestamp()::text || ut.user_id || nt.type)),
  ut.user_id,
  ut.role,
  nt.type,
  true,
  true,
  now(),
  now()
FROM user_targets ut
CROSS JOIN notification_types nt
ON CONFLICT ("user_id", "role", "notification_type") DO NOTHING;
