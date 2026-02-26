CREATE TABLE IF NOT EXISTS "public"."v4_admin_users" (
  "id" text PRIMARY KEY DEFAULT (gen_random_uuid())::text NOT NULL,
  "auth_subject_id" uuid UNIQUE,
  "email" text NOT NULL,
  "role" text NOT NULL DEFAULT 'ADMIN',
  "password_hash" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "name" text,
  "phone" text,
  "country" text,
  "state" text,
  "city" text,
  "first_name" text,
  "last_name" text,
  "suspended_until" timestamptz,
  "suspension_reason" text,
  "archived_at" timestamptz,
  "archived_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_login_at" timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "v4_admin_users_email_unique" ON "public"."v4_admin_users" ("email");
CREATE INDEX IF NOT EXISTS "v4_admin_users_email_idx" ON "public"."v4_admin_users" ("email");
CREATE INDEX IF NOT EXISTS "v4_admin_users_role_idx" ON "public"."v4_admin_users" ("role");
CREATE INDEX IF NOT EXISTS "v4_admin_users_status_idx" ON "public"."v4_admin_users" ("status");

CREATE TABLE IF NOT EXISTS "public"."v4_admin_bootstrap_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token_hash" text UNIQUE NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "v4_admin_bootstrap_tokens_hash_idx" ON "public"."v4_admin_bootstrap_tokens" ("token_hash");
CREATE INDEX IF NOT EXISTS "v4_admin_bootstrap_tokens_expires_idx" ON "public"."v4_admin_bootstrap_tokens" ("expires_at");

CREATE TABLE IF NOT EXISTS "public"."v4_admin_invite_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token_hash" text UNIQUE NOT NULL,
  "email" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_by_admin_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "v4_admin_invite_tokens_hash_idx" ON "public"."v4_admin_invite_tokens" ("token_hash");
CREATE INDEX IF NOT EXISTS "v4_admin_invite_tokens_email_idx" ON "public"."v4_admin_invite_tokens" ("email");
CREATE INDEX IF NOT EXISTS "v4_admin_invite_tokens_expires_idx" ON "public"."v4_admin_invite_tokens" ("expires_at");
