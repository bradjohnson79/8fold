-- Harden dispute_votes.status: only ACTIVE or SUPERSEDED allowed.
ALTER TABLE "8fold_test"."dispute_votes" DROP CONSTRAINT IF EXISTS "dispute_votes_status_check";
ALTER TABLE "8fold_test"."dispute_votes" ADD CONSTRAINT "dispute_votes_status_check" CHECK (status IN ('ACTIVE','SUPERSEDED'));
