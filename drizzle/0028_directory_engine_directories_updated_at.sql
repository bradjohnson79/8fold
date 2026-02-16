-- DISE: add directories.updated_at (directory_engine schema)
-- Safe to run multiple times.

alter table directory_engine.directories
  add column if not exists updated_at timestamptz not null default now();

