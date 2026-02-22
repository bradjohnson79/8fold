-- Public schema canonicalization pack (admin-domain missing tables).
-- Idempotent: enum/type/table/index creation uses IF NOT EXISTS semantics.

BEGIN;

-- ============================================================================
-- Enums required by these tables
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public."CountryCode" AS ENUM ('CA', 'US');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
ALTER TYPE public."CountryCode" ADD VALUE IF NOT EXISTS 'CA';
ALTER TYPE public."CountryCode" ADD VALUE IF NOT EXISTS 'US';

DO $$ BEGIN
  CREATE TYPE public."RouterStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
ALTER TYPE public."RouterStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';
ALTER TYPE public."RouterStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';

DO $$ BEGIN
  CREATE TYPE public."DisputeAlertType" AS ENUM ('DEADLINE_BREACHED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
ALTER TYPE public."DisputeAlertType" ADD VALUE IF NOT EXISTS 'DEADLINE_BREACHED';

DO $$ BEGIN
  CREATE TYPE public."DisputeEnforcementActionType" AS ENUM (
    'RELEASE_ESCROW_FULL',
    'WITHHOLD_FUNDS',
    'RELEASE_ESCROW_PARTIAL',
    'FLAG_ACCOUNT_INTERNAL'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
ALTER TYPE public."DisputeEnforcementActionType" ADD VALUE IF NOT EXISTS 'RELEASE_ESCROW_FULL';
ALTER TYPE public."DisputeEnforcementActionType" ADD VALUE IF NOT EXISTS 'WITHHOLD_FUNDS';
ALTER TYPE public."DisputeEnforcementActionType" ADD VALUE IF NOT EXISTS 'RELEASE_ESCROW_PARTIAL';
ALTER TYPE public."DisputeEnforcementActionType" ADD VALUE IF NOT EXISTS 'FLAG_ACCOUNT_INTERNAL';

DO $$ BEGIN
  CREATE TYPE public."DisputeEnforcementActionStatus" AS ENUM (
    'PENDING',
    'EXECUTED',
    'FAILED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
ALTER TYPE public."DisputeEnforcementActionStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE public."DisputeEnforcementActionStatus" ADD VALUE IF NOT EXISTS 'EXECUTED';
ALTER TYPE public."DisputeEnforcementActionStatus" ADD VALUE IF NOT EXISTS 'FAILED';
ALTER TYPE public."DisputeEnforcementActionStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- ============================================================================
-- Missing tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS public."routers" (
  "userId" text PRIMARY KEY,
  "createdByAdmin" boolean NOT NULL DEFAULT false,
  "isActive" boolean NOT NULL DEFAULT true,
  "isMock" boolean NOT NULL DEFAULT false,
  "isTest" boolean NOT NULL DEFAULT false,
  "termsAccepted" boolean NOT NULL DEFAULT false,
  "profileComplete" boolean NOT NULL DEFAULT false,
  "homeCountry" public."CountryCode" NOT NULL DEFAULT 'US',
  "homeRegionCode" text NOT NULL,
  "homeCity" text,
  "isSeniorRouter" boolean NOT NULL DEFAULT false,
  "dailyRouteLimit" integer NOT NULL DEFAULT 10,
  "routesCompleted" integer NOT NULL DEFAULT 0,
  "routesFailed" integer NOT NULL DEFAULT 0,
  "rating" double precision,
  "status" public."RouterStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public."contractor_accounts" (
  "userId" text PRIMARY KEY,
  "createdByAdmin" boolean DEFAULT false,
  "isActive" boolean DEFAULT true,
  "isMock" boolean DEFAULT false,
  "isTest" boolean DEFAULT false,
  "status" text,
  "wizardCompleted" boolean NOT NULL DEFAULT false,
  "waiverAccepted" boolean NOT NULL DEFAULT false,
  "waiverAcceptedAt" timestamptz,
  "firstName" text,
  "lastName" text,
  "businessName" text,
  "businessNumber" text,
  "addressMode" text,
  "addressSearchDisplayName" text,
  "address1" text,
  "address2" text,
  "apt" text,
  "postalCode" text,
  "tradeCategory" text,
  "serviceRadiusKm" integer DEFAULT 25,
  "country" public."CountryCode" DEFAULT 'US',
  "regionCode" text,
  "city" text,
  "tradeStartYear" integer,
  "tradeStartMonth" integer,
  "payoutMethod" text,
  "payoutStatus" text,
  "stripeAccountId" text,
  "isApproved" boolean DEFAULT false,
  "jobsCompleted" integer DEFAULT 0,
  "rating" double precision,
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public."JobPayment" (
  "id" text PRIMARY KEY,
  "jobId" text,
  "stripePaymentIntentId" text NOT NULL,
  "stripePaymentIntentStatus" text NOT NULL,
  "stripeChargeId" text,
  "amountCents" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'PENDING',
  "escrowLockedAt" timestamp,
  "paymentCapturedAt" timestamp,
  "paymentReleasedAt" timestamp,
  "refundedAt" timestamp,
  "refundAmountCents" integer,
  "refundIssuedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS public."conversations" (
  "id" text PRIMARY KEY,
  "jobId" text NOT NULL,
  "contractorUserId" text NOT NULL,
  "jobPosterUserId" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "conversations_jobId_idx" ON public."conversations" ("jobId");
CREATE INDEX IF NOT EXISTS "conversations_participants_idx" ON public."conversations" ("contractorUserId", "jobPosterUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_job_participants_uniq"
  ON public."conversations" ("jobId", "contractorUserId", "jobPosterUserId");

CREATE TABLE IF NOT EXISTS public."messages" (
  "id" text PRIMARY KEY,
  "conversationId" text NOT NULL,
  "senderUserId" text NOT NULL,
  "senderRole" text NOT NULL,
  "body" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "messages_conversation_created_idx" ON public."messages" ("conversationId", "createdAt");

CREATE TABLE IF NOT EXISTS public."dispute_evidence" (
  "id" text PRIMARY KEY,
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disputeCaseId" text NOT NULL,
  "submittedByUserId" text NOT NULL,
  "kind" text NOT NULL,
  "summary" text,
  "url" text,
  "metadata" jsonb
);

CREATE TABLE IF NOT EXISTS public."dispute_votes" (
  "id" text PRIMARY KEY,
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disputeCaseId" text NOT NULL,
  "voterType" text NOT NULL,
  "voterUserId" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "vote" text NOT NULL,
  "rationale" text,
  "model" text,
  "confidence" integer,
  "payload" jsonb
);

CREATE TABLE IF NOT EXISTS public."dispute_alerts" (
  "id" text PRIMARY KEY,
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disputeCaseId" text NOT NULL,
  "type" public."DisputeAlertType" NOT NULL,
  "handledAt" timestamp
);

CREATE TABLE IF NOT EXISTS public."dispute_enforcement_actions" (
  "id" text PRIMARY KEY,
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp NOT NULL,
  "disputeCaseId" text NOT NULL,
  "type" public."DisputeEnforcementActionType" NOT NULL,
  "status" public."DisputeEnforcementActionStatus" NOT NULL DEFAULT 'PENDING',
  "payload" jsonb,
  "requestedByUserId" text NOT NULL,
  "executedByUserId" text,
  "executedAt" timestamp,
  "error" text
);

COMMIT;

