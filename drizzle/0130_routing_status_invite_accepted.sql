-- Ensure INVITE_ACCEPTED exists in RoutingStatus enum (idempotent).
-- Production may not have run 0123; this unblocks contractor accept flow.
ALTER TYPE public."RoutingStatus" ADD VALUE IF NOT EXISTS 'INVITE_ACCEPTED';
