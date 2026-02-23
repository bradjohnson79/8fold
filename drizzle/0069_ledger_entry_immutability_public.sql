-- 0069: LedgerEntry immutability triggers for public schema
-- financial-audit requires ledger_entry_no_update and ledger_entry_no_delete.

CREATE OR REPLACE FUNCTION public.ledger_entry_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'LedgerEntry is immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_entry_no_update ON public."LedgerEntry";
DROP TRIGGER IF EXISTS ledger_entry_no_delete ON public."LedgerEntry";

CREATE TRIGGER ledger_entry_no_update
  BEFORE UPDATE ON public."LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION public.ledger_entry_immutable();

CREATE TRIGGER ledger_entry_no_delete
  BEFORE DELETE ON public."LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION public.ledger_entry_immutable();
