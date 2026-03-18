-- Migration 0147: Add timing fields to discovery_runs
-- started_at / finished_at / elapsed_ms allow per-run performance diagnostics.

ALTER TABLE directory_engine.discovery_runs
  ADD COLUMN IF NOT EXISTS started_at  timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS elapsed_ms  integer;
