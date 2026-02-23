-- Promote JobDraft_v3 to become the active JobDraft table.
-- After this, Drizzle schema points to clean V3 table.

BEGIN;

ALTER TABLE "JobDraft_v3"
RENAME TO "JobDraft";

COMMIT;
