-- Freeze legacy JobDraft table: rename to JobDraft_legacy_frozen,
-- revoke write permissions, add triggers to block INSERT/UPDATE/DELETE.
-- Legacy table becomes read-only archive.

BEGIN;

-- Rename legacy table
ALTER TABLE "JobDraft"
RENAME TO "JobDraft_legacy_frozen";

-- Remove write permissions
REVOKE INSERT, UPDATE, DELETE ON "JobDraft_legacy_frozen" FROM PUBLIC;

-- Prevent writes even from app role
CREATE OR REPLACE FUNCTION block_legacy_jobdraft_writes()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'JobDraft legacy table is frozen and read-only.';
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
