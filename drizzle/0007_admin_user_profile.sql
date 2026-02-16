-- Admin profile fields for operational identity.
-- Admins live in AdminUser; profile data extends that table.

ALTER TABLE "8fold_test"."AdminUser"
ADD COLUMN IF NOT EXISTS "fullName" TEXT,
ADD COLUMN IF NOT EXISTS "country" TEXT,
ADD COLUMN IF NOT EXISTS "state" TEXT,
ADD COLUMN IF NOT EXISTS "city" TEXT,
ADD COLUMN IF NOT EXISTS "address" TEXT;
