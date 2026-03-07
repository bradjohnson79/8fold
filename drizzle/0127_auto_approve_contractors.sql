-- Backfill: auto-approve all PENDING contractors.
-- Manual approval is removed; readiness gates (Terms, Profile, Stripe) control eligibility.

UPDATE "Contractor"
SET status = 'APPROVED',
    "approvedAt" = NOW()
WHERE status = 'PENDING';

UPDATE contractor_accounts
SET "isApproved" = true
WHERE "isApproved" = false;

-- Update schema defaults so new rows are auto-approved.
ALTER TABLE "Contractor" ALTER COLUMN status SET DEFAULT 'APPROVED';
ALTER TABLE contractor_accounts ALTER COLUMN "isApproved" SET DEFAULT true;
