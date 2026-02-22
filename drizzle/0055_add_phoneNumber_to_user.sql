-- Add canonical phoneNumber + status columns to User (schema alignment).
-- Production DB lacked "phone" → 42703; also lacked "status".
-- Idempotent: IF NOT EXISTS.

alter table "User"
  add column if not exists "phoneNumber" text;

-- UserStatus enum must exist (from prior migrations). Add column with default.
alter table "User"
  add column if not exists "status" "UserStatus" default 'ACTIVE'::"UserStatus";
