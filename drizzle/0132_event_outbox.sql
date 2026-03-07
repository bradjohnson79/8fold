-- Transactional outbox for domain events.
-- Events are written inside business transactions and processed asynchronously.
-- Ensures notification failures never break core transactions.
CREATE TABLE IF NOT EXISTS v4_event_outbox (
  id uuid PRIMARY KEY,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS v4_event_outbox_unprocessed_idx
ON v4_event_outbox (processed_at)
WHERE processed_at IS NULL;
