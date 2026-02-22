-- Align public."User" to canonical shape (production uses public schema).
-- Idempotent: ADD COLUMN IF NOT EXISTS.
-- Only modifies public schema.

-- Core identity
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "clerkUserId" text;
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "name" text;

-- Lifecycle + timestamps
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz;
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "accountStatus" text DEFAULT 'ACTIVE';
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "suspendedUntil" timestamptz;
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "archivedAt" timestamptz;
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "deletionReason" text;
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "suspensionReason" text;
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "archivedReason" text;
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "updatedByAdminId" text;

-- Router referral
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "referredByRouterId" text;

-- Geocoded location
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "formattedAddress" text DEFAULT '';
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "latitude" double precision;
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "longitude" double precision;

-- Legal address
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "legalStreet" text DEFAULT '';
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "legalCity" text DEFAULT '';
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "legalProvince" text DEFAULT '';
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "legalPostalCode" text DEFAULT '';
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "legalCountry" text DEFAULT 'US';

-- Jurisdiction (if CountryCode enum exists in public; else use text)
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "countryCode" text DEFAULT 'US';
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "stateCode" text DEFAULT '';

-- Unique index (allows multiple NULLs; enforces uniqueness for non-null)
CREATE UNIQUE INDEX IF NOT EXISTS "User_clerkUserId_unique"
ON public."User" ("clerkUserId");
