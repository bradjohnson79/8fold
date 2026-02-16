-- User lifecycle: ARCHIVED status, suspensionReason, archivedReason, updatedByAdminId
-- Add ARCHIVED to UserStatus enum (add-only; IF NOT EXISTS in PG 15+)
ALTER TYPE "8fold_test"."UserStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

-- Add lifecycle columns to User
ALTER TABLE "8fold_test"."User"
ADD COLUMN IF NOT EXISTS "suspensionReason" TEXT NULL,
ADD COLUMN IF NOT EXISTS "archivedReason" TEXT NULL,
ADD COLUMN IF NOT EXISTS "updatedByAdminId" UUID NULL;
