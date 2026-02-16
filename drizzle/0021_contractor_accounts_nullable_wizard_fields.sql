-- Make contractor_accounts wizard/profile fields nullable by design.
-- Required validation is enforced in the onboarding wizard before wizardCompleted=true.
--
-- Contract:
-- - Only userId (PK), wizardCompleted (NOT NULL default false), and createdAt stay NOT NULL.
-- - All other fields must be nullable so first-login auto-provision inserts never fail.

ALTER TABLE "contractor_accounts" ALTER COLUMN "createdByAdmin" DROP NOT NULL;
ALTER TABLE "contractor_accounts" ALTER COLUMN "isActive" DROP NOT NULL;
ALTER TABLE "contractor_accounts" ALTER COLUMN "isMock" DROP NOT NULL;
ALTER TABLE "contractor_accounts" ALTER COLUMN "isTest" DROP NOT NULL;

ALTER TABLE "contractor_accounts" ALTER COLUMN "tradeCategory" DROP NOT NULL;
ALTER TABLE "contractor_accounts" ALTER COLUMN "serviceRadiusKm" DROP NOT NULL;
ALTER TABLE "contractor_accounts" ALTER COLUMN "country" DROP NOT NULL;
ALTER TABLE "contractor_accounts" ALTER COLUMN "regionCode" DROP NOT NULL;

ALTER TABLE "contractor_accounts" ALTER COLUMN "isApproved" DROP NOT NULL;
ALTER TABLE "contractor_accounts" ALTER COLUMN "jobsCompleted" DROP NOT NULL;

