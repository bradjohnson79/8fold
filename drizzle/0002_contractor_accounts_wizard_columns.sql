-- ContractorAccount wizard/profile columns (permissive).
-- These columns are used by the contractor profile wizard routes.

ALTER TABLE "contractor_accounts"
ADD COLUMN IF NOT EXISTS "status" TEXT;

ALTER TABLE "contractor_accounts"
ADD COLUMN IF NOT EXISTS "wizardCompleted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "contractor_accounts"
ADD COLUMN IF NOT EXISTS "firstName" TEXT;

ALTER TABLE "contractor_accounts"
ADD COLUMN IF NOT EXISTS "lastName" TEXT;

ALTER TABLE "contractor_accounts"
ADD COLUMN IF NOT EXISTS "businessName" TEXT;

ALTER TABLE "contractor_accounts"
ADD COLUMN IF NOT EXISTS "businessNumber" TEXT;

ALTER TABLE "contractor_accounts"
ADD COLUMN IF NOT EXISTS "addressMode" TEXT;

ALTER TABLE "contractor_accounts"
ADD COLUMN IF NOT EXISTS "addressSearchDisplayName" TEXT;

ALTER TABLE "contractor_accounts"
ADD COLUMN IF NOT EXISTS "address1" TEXT;

ALTER TABLE "contractor_accounts"
ADD COLUMN IF NOT EXISTS "address2" TEXT;

ALTER TABLE "contractor_accounts"
ADD COLUMN IF NOT EXISTS "apt" TEXT;

ALTER TABLE "contractor_accounts"
ADD COLUMN IF NOT EXISTS "postalCode" TEXT;

ALTER TABLE "contractor_accounts"
ADD COLUMN IF NOT EXISTS "tradeStartYear" INTEGER;

ALTER TABLE "contractor_accounts"
ADD COLUMN IF NOT EXISTS "tradeStartMonth" INTEGER;

