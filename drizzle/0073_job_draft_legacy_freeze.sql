-- Freeze legacy JobDraft table: rename to JobDraft_legacy_frozen,
-- add triggers to block INSERT/UPDATE/DELETE.
-- Legacy table becomes read-only archive.

BEGIN;

ALTER TABLE "JobDraft"
RENAME TO "JobDraft_legacy_frozen";

CREATE OR REPLACE FUNCTION block_legacy_jobdraft_writes()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Legacy JobDraft table is frozen.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER jobdraft_legacy_block_insert
BEFORE INSERT ON "JobDraft_legacy_frozen"
FOR EACH ROW EXECUTE FUNCTION block_legacy_jobdraft_writes();

CREATE TRIGGER jobdraft_legacy_block_update
BEFORE UPDATE ON "JobDraft_legacy_frozen"
FOR EACH ROW EXECUTE FUNCTION block_legacy_jobdraft_writes();

CREATE TRIGGER jobdraft_legacy_block_delete
BEFORE DELETE ON "JobDraft_legacy_frozen"
FOR EACH ROW EXECUTE FUNCTION block_legacy_jobdraft_writes();

COMMIT;
