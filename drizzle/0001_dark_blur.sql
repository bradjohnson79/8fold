CREATE SCHEMA "directory_engine";
--> statement-breakpoint
CREATE TYPE "public"."AiAppraisalStatus" AS ENUM('PENDING', 'COMPLETED', 'FAILED', 'APPLIED', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."ContractorLedgerBucket" AS ENUM('PENDING', 'PAID');--> statement-breakpoint
CREATE TYPE "public"."ContractorLedgerEntryType" AS ENUM('CONTRACTOR_EARNING', 'CONTRACTOR_PAYOUT');--> statement-breakpoint
CREATE TYPE "public"."ContractorPayoutStatus" AS ENUM('PENDING', 'PAID', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."ContractorStatus" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."ContractorTrade" AS ENUM('JUNK_REMOVAL', 'YARDWORK_GROUNDSKEEPING', 'CARPENTRY', 'DRYWALL', 'ROOFING', 'PLUMBING', 'ELECTRICAL', 'WELDING');--> statement-breakpoint
CREATE TYPE "public"."CountryCode" AS ENUM('CA', 'US');--> statement-breakpoint
CREATE TYPE "public"."CurrencyCode" AS ENUM('CAD', 'USD');--> statement-breakpoint
CREATE TYPE "public"."CustomerRejectReason" AS ENUM('QUALITY_ISSUE', 'INCOMPLETE_WORK', 'DAMAGE', 'NO_SHOW', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."DisputeAgainstRole" AS ENUM('JOB_POSTER', 'CONTRACTOR');--> statement-breakpoint
CREATE TYPE "public"."DisputeAlertType" AS ENUM('DEADLINE_BREACHED');--> statement-breakpoint
CREATE TYPE "public"."DisputeDecision" AS ENUM('FAVOR_POSTER', 'FAVOR_CONTRACTOR', 'PARTIAL', 'NO_ACTION', 'FAVOR_JOB_POSTER');--> statement-breakpoint
CREATE TYPE "public"."DisputeEnforcementActionStatus" AS ENUM('PENDING', 'EXECUTED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."DisputeEnforcementActionType" AS ENUM('RELEASE_ESCROW_FULL', 'WITHHOLD_FUNDS', 'RELEASE_ESCROW_PARTIAL', 'FLAG_ACCOUNT_INTERNAL');--> statement-breakpoint
CREATE TYPE "public"."DisputeReason" AS ENUM('PRICING', 'WORK_QUALITY', 'NO_SHOW', 'PAYMENT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."DisputeStatus" AS ENUM('SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFO', 'DECIDED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."EcdUpdateReason" AS ENUM('AWAITING_PARTS_MATERIALS', 'SCOPE_EXPANDED', 'SCHEDULING_DELAY', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."EscrowKind" AS ENUM('JOB_ESCROW', 'PARTS_MATERIALS');--> statement-breakpoint
CREATE TYPE "public"."EscrowStatus" AS ENUM('PENDING', 'FUNDED', 'RELEASED', 'REFUNDED', 'FAILED', 'PARTIALLY_REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."FinancialIntegrityAlertStatus" AS ENUM('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED');--> statement-breakpoint
CREATE TYPE "public"."FinancialIntegrityAlertType" AS ENUM('MISSING_CHARGE', 'MISSING_TRANSFER', 'MISSING_REFUND', 'STRIPE_REFUND_NOT_IN_LEDGER', 'LEDGER_REFUND_NOT_IN_STRIPE', 'STRIPE_AMOUNT_MISMATCH', 'DOUBLE_TRANSFER', 'ESCROW_RELEASE_WITHOUT_STRIPE_CAPTURE', 'NEGATIVE_BALANCE_DRIFT', 'UNRECONCILED_PAYMENT_AFTER_24H');--> statement-breakpoint
CREATE TYPE "public"."FinancialIntegritySeverity" AS ENUM('INFO', 'WARNING', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."InternalAccountFlagType" AS ENUM('DISPUTE_RISK', 'FRAUD_REVIEW', 'MANUAL_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."JobHoldReason" AS ENUM('DISPUTE', 'QUALITY_ISSUE', 'FRAUD_REVIEW', 'MANUAL_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."JobHoldStatus" AS ENUM('ACTIVE', 'RELEASED');--> statement-breakpoint
CREATE TYPE "public"."JobPayoutStatus" AS ENUM('NOT_READY', 'READY', 'RELEASED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."job_request_status" AS ENUM('pending', 'approved', 'rejected', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."JobSource" AS ENUM('MOCK', 'REAL', 'AI_REGENERATED');--> statement-breakpoint
CREATE TYPE "public"."JobStatus" AS ENUM('DRAFT', 'PUBLISHED', 'ASSIGNED', 'IN_PROGRESS', 'CONTRACTOR_COMPLETED', 'CUSTOMER_APPROVED', 'CUSTOMER_REJECTED', 'COMPLETION_FLAGGED', 'COMPLETED_APPROVED', 'OPEN_FOR_ROUTING', 'COMPLETED', 'DISPUTED', 'JOB_STARTED', 'CANCELLED', 'APPRAISAL_PENDING', 'ASSIGNED_CANCEL_PENDING');--> statement-breakpoint
CREATE TYPE "public"."JobType" AS ENUM('urban', 'regional');--> statement-breakpoint
CREATE TYPE "public"."LedgerBucket" AS ENUM('PENDING', 'AVAILABLE', 'PAID', 'HELD');--> statement-breakpoint
CREATE TYPE "public"."LedgerDirection" AS ENUM('CREDIT', 'DEBIT');--> statement-breakpoint
CREATE TYPE "public"."LedgerEntryType" AS ENUM('ROUTER_EARNING', 'BROKER_FEE', 'PAYOUT', 'ADJUSTMENT', 'ESCROW_FUND', 'PNM_FUND', 'ESCROW_RELEASE', 'ESCROW_REFUND', 'PLATFORM_FEE', 'ROUTER_EARN', 'CONTRACTOR_EARN', 'PM_ESCROW_FUNDED', 'PM_RELEASE', 'PM_REFUND', 'PM_CREDIT', 'AUTH_HOLD', 'CAPTURE', 'ESCROW_AVAILABLE', 'PAYABLE_CONTRACTOR', 'PAYABLE_ROUTER', 'TAX_BUCKET', 'AUTH_EXPIRED', 'CHARGE', 'ESCROW_HELD', 'REFUND');--> statement-breakpoint
CREATE TYPE "public"."MaterialsEscrowLedgerEntryType" AS ENUM('DEPOSIT', 'RELEASE', 'POSTER_CREDIT', 'POSTER_REFUND');--> statement-breakpoint
CREATE TYPE "public"."MaterialsEscrowStatus" AS ENUM('HELD', 'RELEASED');--> statement-breakpoint
CREATE TYPE "public"."MaterialsPaymentStatus" AS ENUM('PENDING', 'CAPTURED', 'FAILED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."MaterialsReceiptStatus" AS ENUM('DRAFT', 'SUBMITTED');--> statement-breakpoint
CREATE TYPE "public"."MaterialsRequestStatus" AS ENUM('SUBMITTED', 'APPROVED', 'DECLINED', 'ESCROWED', 'RECEIPTS_SUBMITTED', 'REIMBURSED');--> statement-breakpoint
CREATE TYPE "public"."MonitoringActorRole" AS ENUM('ADMIN', 'ROUTER', 'CONTRACTOR', 'JOB_POSTER');--> statement-breakpoint
CREATE TYPE "public"."MonitoringEventType" AS ENUM('JOB_APPROACHING_24H', 'JOB_OVERDUE_UNROUTED', 'JOB_ROUTED', 'JOB_COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."PartsMaterialReleaseStatus" AS ENUM('NOT_READY', 'READY', 'RELEASED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."PartsMaterialStatus" AS ENUM('REQUESTED', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."PaymentStatus" AS ENUM('UNPAID', 'REQUIRES_ACTION', 'FUNDED', 'FAILED', 'REFUNDED', 'AUTHORIZED', 'FUNDS_SECURED', 'EXPIRED_UNFUNDED', 'PARTIALLY_REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."PayoutProvider" AS ENUM('STRIPE', 'WISE');--> statement-breakpoint
CREATE TYPE "public"."PayoutRequestStatus" AS ENUM('REQUESTED', 'REJECTED', 'PAID', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."PayoutStatus" AS ENUM('PENDING', 'PAID', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."PMRequestStatus" AS ENUM('DRAFT', 'SUBMITTED', 'AMENDMENT_REQUESTED', 'APPROVED', 'PAYMENT_PENDING', 'FUNDED', 'RECEIPTS_SUBMITTED', 'VERIFIED', 'RELEASED', 'CLOSED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."PublicJobStatus" AS ENUM('OPEN', 'IN_PROGRESS');--> statement-breakpoint
CREATE TYPE "public"."RolePayoutMethod" AS ENUM('STRIPE');--> statement-breakpoint
CREATE TYPE "public"."RolePayoutStatus" AS ENUM('UNSET', 'PENDING', 'ACTIVE');--> statement-breakpoint
CREATE TYPE "public"."RouterStatus" AS ENUM('ACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."RoutingStatus" AS ENUM('UNROUTED', 'ROUTED_BY_ROUTER', 'ROUTED_BY_ADMIN', 'INVITES_SENT', 'INVITE_ACCEPTED', 'INVITES_EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."SendBlockedReason" AS ENUM('REGION_PAUSED', 'IDENTITY_PAUSED', 'DAILY_LIMIT_EXCEEDED', 'INTERVAL_LIMIT_EXCEEDED');--> statement-breakpoint
CREATE TYPE "public"."SendQueueStatus" AS ENUM('QUEUED', 'SENT', 'FAILED', 'BLOCKED');--> statement-breakpoint
CREATE TYPE "public"."SupportRoleContext" AS ENUM('JOB_POSTER', 'ROUTER', 'CONTRACTOR');--> statement-breakpoint
CREATE TYPE "public"."SupportTicketCategory" AS ENUM('PRICING', 'JOB_POSTING', 'ROUTING', 'CONTRACTOR', 'PAYOUTS', 'AI_APPRAISAL_FAILURE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."SupportTicketPriority" AS ENUM('LOW', 'NORMAL', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."SupportTicketStatus" AS ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."SupportTicketType" AS ENUM('HELP', 'DISPUTE');--> statement-breakpoint
CREATE TYPE "public"."TradeCategory" AS ENUM('PLUMBING', 'ELECTRICAL', 'HVAC', 'APPLIANCE', 'HANDYMAN', 'PAINTING', 'CARPENTRY', 'DRYWALL', 'ROOFING', 'JANITORIAL_CLEANING', 'LANDSCAPING', 'FENCING', 'SNOW_REMOVAL', 'JUNK_REMOVAL', 'MOVING', 'AUTOMOTIVE', 'FURNITURE_ASSEMBLY', 'WELDING', 'JACK_OF_ALL_TRADES');--> statement-breakpoint
CREATE TYPE "public"."UserRole" AS ENUM('ADMIN', 'CONTRACTOR', 'ROUTER', 'JOB_POSTER');--> statement-breakpoint
CREATE TYPE "public"."UserStatus" AS ENUM('ACTIVE', 'SUSPENDED', 'ARCHIVED', 'PENDING');--> statement-breakpoint
CREATE TYPE "public"."JobDraftStatus" AS ENUM('ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."JobDraftStep" AS ENUM('DETAILS', 'PRICING', 'AVAILABILITY', 'PAYMENT', 'CONFIRMED');--> statement-breakpoint
CREATE TYPE "public"."seo_sitemap_type" AS ENUM('index', 'jobs', 'services', 'contractors', 'cities', 'service-locations');--> statement-breakpoint
CREATE TABLE "User" (
	"id" text PRIMARY KEY DEFAULT (gen_random_uuid())::text NOT NULL,
	"clerkUserId" text NOT NULL,
	"authUserId" text,
	"email" text,
	"phoneNumber" text,
	"name" text,
	"role" "UserRole" NOT NULL,
	"status" "UserStatus" DEFAULT 'ACTIVE' NOT NULL,
	"referredByRouterId" text,
	"formattedAddress" text DEFAULT '' NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"legalStreet" text DEFAULT '' NOT NULL,
	"legalCity" text DEFAULT '' NOT NULL,
	"legalProvince" text DEFAULT '' NOT NULL,
	"legalPostalCode" text DEFAULT '' NOT NULL,
	"legalCountry" text DEFAULT 'US' NOT NULL,
	"accountStatus" text DEFAULT 'ACTIVE' NOT NULL,
	"suspendedUntil" timestamp,
	"suspensionReason" text,
	"archivedAt" timestamp,
	"archivedReason" text,
	"archivedByAdminId" text,
	"deletionReason" text,
	"updatedByAdminId" text,
	"country" "CountryCode" DEFAULT 'US' NOT NULL,
	"countryCode" "CountryCode" DEFAULT 'US' NOT NULL,
	"stateCode" text DEFAULT '' NOT NULL,
	"tosVersion" text,
	"acceptedTosAt" timestamp,
	"stripeCustomerId" text,
	"stripeDefaultPaymentMethodId" text,
	"stripeStatus" text,
	"stripeUpdatedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "User_clerkUserId_unique" UNIQUE("clerkUserId"),
	CONSTRAINT "User_authUserId_unique" UNIQUE("authUserId"),
	CONSTRAINT "User_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"status" "JobStatus" DEFAULT 'PUBLISHED' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by_admin_id" text,
	"suspended_until" timestamp with time zone,
	"suspension_reason" text,
	"cancel_request_pending" boolean DEFAULT false NOT NULL,
	"title" text NOT NULL,
	"scope" text NOT NULL,
	"region" text NOT NULL,
	"country" "CountryCode" DEFAULT 'US' NOT NULL,
	"country_code" "CountryCode" DEFAULT 'US' NOT NULL,
	"state_code" text DEFAULT '' NOT NULL,
	"currency" "CurrencyCode" DEFAULT 'USD' NOT NULL,
	"region_code" text,
	"region_name" text,
	"city" text,
	"postal_code" text,
	"address_full" text,
	"ai_appraisal_status" "AiAppraisalStatus" DEFAULT 'PENDING' NOT NULL,
	"ai_appraised_at" timestamp,
	"ai_suggested_total" integer,
	"ai_price_range_low" integer,
	"ai_price_range_high" integer,
	"ai_confidence" text,
	"ai_reasoning" text,
	"pricing_intel" jsonb,
	"pricing_intel_generated_at" timestamp,
	"pricing_intel_model" text,
	"superseded_by_job_id" text,
	"is_mock" boolean DEFAULT false NOT NULL,
	"mock_seed_batch" text,
	"public_status" "PublicJobStatus" DEFAULT 'OPEN' NOT NULL,
	"job_source" "JobSource" DEFAULT 'REAL' NOT NULL,
	"repeat_contractor_discount_cents" integer DEFAULT 0 NOT NULL,
	"service_type" text DEFAULT 'handyman' NOT NULL,
	"trade_category" "TradeCategory" DEFAULT 'HANDYMAN' NOT NULL,
	"time_window" text,
	"router_earnings_cents" integer DEFAULT 0 NOT NULL,
	"broker_fee_cents" integer DEFAULT 0 NOT NULL,
	"contractor_payout_cents" integer DEFAULT 0 NOT NULL,
	"labor_total_cents" integer DEFAULT 0 NOT NULL,
	"materials_total_cents" integer DEFAULT 0 NOT NULL,
	"transaction_fee_cents" integer DEFAULT 0 NOT NULL,
	"payment_status" "PaymentStatus" DEFAULT 'UNPAID' NOT NULL,
	"payout_status" "JobPayoutStatus" DEFAULT 'NOT_READY' NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"payment_currency" text DEFAULT 'cad' NOT NULL,
	"province" text,
	"is_regional" boolean DEFAULT false NOT NULL,
	"appraisal_subtotal_cents" integer DEFAULT 0 NOT NULL,
	"regional_fee_cents" integer DEFAULT 0 NOT NULL,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"tax_amount_cents" integer DEFAULT 0 NOT NULL,
	"total_amount_cents" integer DEFAULT 0 NOT NULL,
	"stripe_payment_intent_id" text,
	"stripe_payment_intent_status" text,
	"stripe_charge_id" text,
	"stripe_customer_id" text,
	"stripe_payment_method_id" text,
	"stripe_capture_deadline_at" timestamp,
	"stripe_authorized_at" timestamp,
	"stripe_captured_at" timestamp,
	"stripe_canceled_at" timestamp,
	"stripe_paid_at" timestamp,
	"stripe_refunded_at" timestamp,
	"accepted_at" timestamp,
	"authorization_expires_at" timestamp,
	"funds_secured_at" timestamp,
	"completion_deadline_at" timestamp,
	"funded_at" timestamp,
	"released_at" timestamp,
	"refunded_at" timestamp,
	"contractor_transfer_id" text,
	"router_transfer_id" text,
	"escrow_locked_at" timestamp,
	"payment_captured_at" timestamp,
	"payment_released_at" timestamp,
	"price_median_cents" integer,
	"price_adjustment_cents" integer,
	"pricing_version" text DEFAULT 'v1-median-delta' NOT NULL,
	"junk_hauling_items" jsonb,
	"availability" jsonb,
	"photo_urls" jsonb,
	"job_type" "JobType" NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"job_poster_user_id" text,
	"contacted_at" timestamp,
	"guarantee_eligible_at" timestamp,
	"claimed_at" timestamp,
	"claimed_by_user_id" text,
	"admin_routed_by_id" text,
	"contractor_user_id" text,
	"posted_at" timestamp DEFAULT now() NOT NULL,
	"routing_due_at" timestamp,
	"first_routed_at" timestamp,
	"routing_status" "RoutingStatus" DEFAULT 'UNROUTED' NOT NULL,
	"failsafe_routing" boolean DEFAULT false NOT NULL,
	"routed_at" timestamp,
	"routing_started_at" timestamp,
	"routing_expires_at" timestamp,
	"poster_accept_expires_at" timestamp,
	"poster_accepted_at" timestamp,
	"appointment_at" timestamp,
	"appointment_published_at" timestamp,
	"appointment_accepted_at" timestamp,
	"contractor_completed_at" timestamp,
	"contractor_marked_complete_at" timestamp,
	"poster_marked_complete_at" timestamp,
	"completed_at" timestamp,
	"completion_window_expires_at" timestamp,
	"contractor_completion_summary" text,
	"customer_approved_at" timestamp,
	"customer_rejected_at" timestamp,
	"customer_reject_reason" "CustomerRejectReason",
	"customer_reject_notes" text,
	"customer_feedback" text,
	"customer_completion_summary" text,
	"router_approved_at" timestamp,
	"router_approval_notes" text,
	"completion_flagged_at" timestamp,
	"completion_flag_reason" text,
	"contractor_action_token_hash" text,
	"customer_action_token_hash" text,
	"estimated_completion_date" timestamp,
	"estimate_set_at" timestamp,
	"estimate_updated_at" timestamp,
	"estimate_update_reason" "EcdUpdateReason",
	"estimate_update_other_text" text
);
--> statement-breakpoint
CREATE TABLE "job_edit_requests" (
	"id" text PRIMARY KEY DEFAULT (gen_random_uuid())::text NOT NULL,
	"job_id" text NOT NULL,
	"job_poster_id" text NOT NULL,
	"original_title" text NOT NULL,
	"original_description" text NOT NULL,
	"requested_title" text NOT NULL,
	"requested_description" text NOT NULL,
	"status" "job_request_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_admin_id" text
);
--> statement-breakpoint
CREATE TABLE "job_cancel_requests" (
	"id" text PRIMARY KEY DEFAULT (gen_random_uuid())::text NOT NULL,
	"job_id" text NOT NULL,
	"job_poster_id" text NOT NULL,
	"reason" text NOT NULL,
	"status" "job_request_status" DEFAULT 'pending' NOT NULL,
	"requested_by_role" text DEFAULT 'JOB_POSTER' NOT NULL,
	"within_penalty_window" boolean DEFAULT false NOT NULL,
	"support_ticket_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_admin_id" text,
	"resolved_at" timestamp with time zone,
	"refund_processed_at" timestamp with time zone,
	"payout_processed_at" timestamp with time zone,
	"suspension_processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "job_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"kind" text NOT NULL,
	"actor" text,
	"url" text,
	"storage_key" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routers" (
	"userId" text PRIMARY KEY NOT NULL,
	"createdByAdmin" boolean DEFAULT false NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"isMock" boolean DEFAULT false NOT NULL,
	"isTest" boolean DEFAULT false NOT NULL,
	"termsAccepted" boolean DEFAULT false NOT NULL,
	"profileComplete" boolean DEFAULT false NOT NULL,
	"homeCountry" "CountryCode" DEFAULT 'US' NOT NULL,
	"homeRegionCode" text NOT NULL,
	"homeCity" text,
	"isSeniorRouter" boolean DEFAULT false NOT NULL,
	"dailyRouteLimit" integer DEFAULT 10 NOT NULL,
	"routesCompleted" integer DEFAULT 0 NOT NULL,
	"routesFailed" integer DEFAULT 0 NOT NULL,
	"rating" double precision,
	"status" "RouterStatus" DEFAULT 'ACTIVE' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_posters" (
	"userId" text PRIMARY KEY NOT NULL,
	"createdByAdmin" boolean DEFAULT false NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"isMock" boolean DEFAULT false NOT NULL,
	"isTest" boolean DEFAULT false NOT NULL,
	"defaultRegion" text,
	"totalJobsPosted" integer DEFAULT 0 NOT NULL,
	"lastJobPostedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "JobPayment" (
	"id" text PRIMARY KEY NOT NULL,
	"jobId" text,
	"stripePaymentIntentId" text NOT NULL,
	"stripePaymentIntentStatus" text NOT NULL,
	"stripeChargeId" text,
	"amountCents" integer NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"escrowLockedAt" timestamp,
	"paymentCapturedAt" timestamp,
	"paymentReleasedAt" timestamp,
	"refundedAt" timestamp,
	"refundAmountCents" integer,
	"refundIssuedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AuditLog" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"actorUserId" text,
	"actorAdminUserId" uuid,
	"action" text NOT NULL,
	"entityType" text NOT NULL,
	"entityId" text NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "JobAssignment" (
	"id" text PRIMARY KEY NOT NULL,
	"jobId" text NOT NULL,
	"contractorId" text NOT NULL,
	"status" text NOT NULL,
	"assignedByAdminUserId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "Contractor" (
	"id" text PRIMARY KEY NOT NULL,
	"status" "ContractorStatus" DEFAULT 'APPROVED' NOT NULL,
	"businessName" text NOT NULL,
	"contactName" text,
	"yearsExperience" integer DEFAULT 3 NOT NULL,
	"phone" text,
	"email" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"approvedAt" timestamp,
	"country" "CountryCode" DEFAULT 'US' NOT NULL,
	"regionCode" text NOT NULL,
	"trade" "ContractorTrade" NOT NULL,
	"categories" text[],
	"tradeCategories" "TradeCategory"[],
	"automotiveEnabled" boolean DEFAULT false NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"regions" text[],
	"stripeAccountId" text,
	"stripePayoutsEnabled" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "LedgerEntry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"userId" text NOT NULL,
	"jobId" text,
	"escrowId" uuid,
	"type" "LedgerEntryType" NOT NULL,
	"direction" "LedgerDirection" NOT NULL,
	"bucket" "LedgerBucket" NOT NULL,
	"amountCents" integer NOT NULL,
	"currency" "CurrencyCode" DEFAULT 'USD' NOT NULL,
	"stripeRef" text,
	"memo" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "PayoutMethod" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp NOT NULL,
	"userId" text NOT NULL,
	"currency" "CurrencyCode" NOT NULL,
	"provider" "PayoutProvider" NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"details" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PayoutRequest" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"status" "PayoutRequestStatus" DEFAULT 'REQUESTED' NOT NULL,
	"userId" text NOT NULL,
	"amountCents" integer NOT NULL,
	"payoutId" text
);
--> statement-breakpoint
CREATE TABLE "Payout" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"paidAt" timestamp,
	"externalReference" text,
	"notesInternal" text,
	"userId" text,
	"status" "PayoutStatus" DEFAULT 'PENDING' NOT NULL,
	"currency" "CurrencyCode",
	"provider" "PayoutProvider",
	"amountCents" integer,
	"scheduledFor" timestamp,
	"failureReason" text
);
--> statement-breakpoint
CREATE TABLE "ContractorPayout" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"contractorId" text NOT NULL,
	"jobId" text,
	"materialsRequestId" text,
	"pmRequestId" uuid,
	"amountCents" integer NOT NULL,
	"scheduledFor" timestamp NOT NULL,
	"status" "ContractorPayoutStatus" DEFAULT 'PENDING' NOT NULL,
	"paidAt" timestamp,
	"externalReference" text,
	"failureReason" text
);
--> statement-breakpoint
CREATE TABLE "ContractorLedgerEntry" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"contractorId" text NOT NULL,
	"jobId" text,
	"type" "ContractorLedgerEntryType" NOT NULL,
	"bucket" "ContractorLedgerBucket" NOT NULL,
	"amountCents" integer NOT NULL,
	"memo" text
);
--> statement-breakpoint
CREATE TABLE "MaterialsEscrowLedgerEntry" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"escrowId" text NOT NULL,
	"type" "MaterialsEscrowLedgerEntryType" NOT NULL,
	"amountCents" integer NOT NULL,
	"currency" "CurrencyCode" DEFAULT 'USD' NOT NULL,
	"memo" text,
	"actorUserId" text
);
--> statement-breakpoint
CREATE TABLE "MaterialsEscrow" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"status" "MaterialsEscrowStatus" DEFAULT 'HELD' NOT NULL,
	"requestId" text NOT NULL,
	"currency" "CurrencyCode" DEFAULT 'USD' NOT NULL,
	"amountCents" integer NOT NULL,
	"releaseDueAt" timestamp,
	"releasedAt" timestamp,
	"overageCents" integer DEFAULT 0 NOT NULL,
	"posterCreditCents" integer DEFAULT 0 NOT NULL,
	"posterRefundCents" integer DEFAULT 0 NOT NULL,
	"receiptTotalCents" integer DEFAULT 0 NOT NULL,
	"reimbursedAmountCents" integer DEFAULT 0 NOT NULL,
	"remainderCents" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "MaterialsRequest" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp NOT NULL,
	"status" "MaterialsRequestStatus" DEFAULT 'SUBMITTED' NOT NULL,
	"jobId" text NOT NULL,
	"contractorId" text NOT NULL,
	"jobPosterUserId" text NOT NULL,
	"routerUserId" text,
	"submittedAt" timestamp DEFAULT now() NOT NULL,
	"approvedAt" timestamp,
	"declinedAt" timestamp,
	"approvedByUserId" text,
	"declinedByUserId" text,
	"currency" "CurrencyCode" DEFAULT 'USD' NOT NULL,
	"totalAmountCents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "MaterialsPayment" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp NOT NULL,
	"requestId" text NOT NULL,
	"stripePaymentIntentId" text NOT NULL,
	"stripePaymentIntentStatus" text DEFAULT 'requires_payment_method' NOT NULL,
	"stripeChargeId" text,
	"status" "MaterialsPaymentStatus" DEFAULT 'PENDING' NOT NULL,
	"amountCents" integer NOT NULL,
	"capturedAt" timestamp,
	"refundAmountCents" integer,
	"refundedAt" timestamp,
	"stripeRefundId" text
);
--> statement-breakpoint
CREATE TABLE "MaterialsReceiptSubmission" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp NOT NULL,
	"status" "MaterialsReceiptStatus" DEFAULT 'DRAFT' NOT NULL,
	"requestId" text NOT NULL,
	"currency" "CurrencyCode" DEFAULT 'USD' NOT NULL,
	"receiptSubtotalCents" integer DEFAULT 0 NOT NULL,
	"receiptTaxCents" integer DEFAULT 0 NOT NULL,
	"receiptTotalCents" integer DEFAULT 0 NOT NULL,
	"merchantName" text,
	"purchaseDate" timestamp,
	"extractionModel" text,
	"extractionRaw" jsonb,
	"submittedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "MaterialsReceiptFile" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"submissionId" text NOT NULL,
	"originalName" text NOT NULL,
	"mimeType" text NOT NULL,
	"sizeBytes" integer NOT NULL,
	"storageKey" text NOT NULL,
	"sha256" text
);
--> statement-breakpoint
CREATE TABLE "MaterialsItem" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"requestId" text NOT NULL,
	"name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unitPriceCents" integer NOT NULL,
	"priceUrl" text,
	"category" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "JobPosterCredit" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"userId" text NOT NULL,
	"escrowId" text,
	"amountCents" integer NOT NULL,
	"memo" text
);
--> statement-breakpoint
CREATE TABLE "StripeWebhookEvent" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"objectId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"processedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "stripe_charge_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_intent_id" text,
	"status" text NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"amount_refunded" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"created_unix" integer,
	"job_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_events_log" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"object_id" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_payment_intent_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"customer_id" text,
	"latest_charge_id" text,
	"created_unix" integer,
	"job_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_refund_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"charge_id" text,
	"payment_intent_id" text,
	"status" text NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"reason" text,
	"created_unix" integer,
	"job_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_sync_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"from_at" timestamp with time zone NOT NULL,
	"to_at" timestamp with time zone NOT NULL,
	"inserted_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"triggered_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_transfer_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"destination_account_id" text,
	"source_transaction_id" text,
	"created_unix" integer,
	"job_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_integrity_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" text,
	"stripe_payment_intent_id" text,
	"stripe_transfer_id" text,
	"alert_type" "FinancialIntegrityAlertType" NOT NULL,
	"severity" "FinancialIntegritySeverity" DEFAULT 'WARNING' NOT NULL,
	"internal_total_cents" integer DEFAULT 0 NOT NULL,
	"stripe_total_cents" integer DEFAULT 0 NOT NULL,
	"difference_cents" integer DEFAULT 0 NOT NULL,
	"status" "FinancialIntegrityAlertStatus" DEFAULT 'OPEN' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_admin_id" uuid
);
--> statement-breakpoint
CREATE TABLE "RouterProfile" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text,
	"address" text,
	"city" text,
	"stateProvince" text,
	"postalCode" text,
	"country" text,
	"lat" double precision,
	"lng" double precision,
	"createdAt" timestamp,
	"updatedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "RouterReward" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"routerUserId" text NOT NULL,
	"referredUserId" text NOT NULL,
	"jobId" text NOT NULL,
	"amount" integer DEFAULT 500 NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"paidAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "RepeatContractorRequest" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"jobId" text NOT NULL,
	"contractorId" text NOT NULL,
	"tradeCategory" "TradeCategory" NOT NULL,
	"status" text NOT NULL,
	"requestedAt" timestamp DEFAULT now() NOT NULL,
	"respondedAt" timestamp,
	"priorJobId" text
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"type" "SupportTicketType" NOT NULL,
	"status" "SupportTicketStatus" DEFAULT 'OPEN' NOT NULL,
	"category" "SupportTicketCategory" NOT NULL,
	"priority" "SupportTicketPriority" DEFAULT 'NORMAL' NOT NULL,
	"createdById" text NOT NULL,
	"assignedToId" text,
	"roleContext" "SupportRoleContext" NOT NULL,
	"subject" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"ticketId" text NOT NULL,
	"authorId" text NOT NULL,
	"message" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"ticketId" text NOT NULL,
	"uploadedById" text NOT NULL,
	"originalName" text NOT NULL,
	"mimeType" text NOT NULL,
	"sizeBytes" integer NOT NULL,
	"storageKey" text NOT NULL,
	"sha256" text
);
--> statement-breakpoint
CREATE TABLE "dispute_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp NOT NULL,
	"ticketId" text NOT NULL,
	"jobId" text NOT NULL,
	"filedByUserId" text NOT NULL,
	"againstUserId" text NOT NULL,
	"againstRole" "DisputeAgainstRole" NOT NULL,
	"disputeReason" "DisputeReason" NOT NULL,
	"description" text NOT NULL,
	"status" "DisputeStatus" DEFAULT 'SUBMITTED' NOT NULL,
	"decision" "DisputeDecision",
	"decisionSummary" text,
	"decisionAt" timestamp,
	"deadlineAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispute_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"disputeCaseId" text NOT NULL,
	"type" "DisputeAlertType" NOT NULL,
	"handledAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "dispute_enforcement_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp NOT NULL,
	"disputeCaseId" text NOT NULL,
	"type" "DisputeEnforcementActionType" NOT NULL,
	"status" "DisputeEnforcementActionStatus" DEFAULT 'PENDING' NOT NULL,
	"payload" jsonb,
	"requestedByUserId" text NOT NULL,
	"executedByUserId" text,
	"executedAt" timestamp,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "internal_account_flags" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp NOT NULL,
	"userId" text NOT NULL,
	"type" "InternalAccountFlagType" NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"reason" text NOT NULL,
	"disputeCaseId" text,
	"createdByUserId" text NOT NULL,
	"resolvedAt" timestamp,
	"resolvedByUserId" text
);
--> statement-breakpoint
CREATE TABLE "JobHold" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"status" "JobHoldStatus" DEFAULT 'ACTIVE' NOT NULL,
	"jobId" text NOT NULL,
	"reason" "JobHoldReason" NOT NULL,
	"notes" text,
	"amountCents" integer,
	"currency" "CurrencyCode",
	"appliedAt" timestamp DEFAULT now() NOT NULL,
	"releasedAt" timestamp,
	"appliedByUserId" text,
	"appliedByAdminUserId" text,
	"releasedByUserId" text,
	"releasedByAdminUserId" text,
	"sourceDisputeCaseId" text
);
--> statement-breakpoint
CREATE TABLE "JobDispatch" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"respondedAt" timestamp,
	"tokenHash" text NOT NULL,
	"jobId" text NOT NULL,
	"contractorId" text NOT NULL,
	"routerUserId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contractor_accounts" (
	"userId" text PRIMARY KEY NOT NULL,
	"createdByAdmin" boolean DEFAULT false,
	"isActive" boolean DEFAULT true,
	"isMock" boolean DEFAULT false,
	"isTest" boolean DEFAULT false,
	"status" text,
	"wizardCompleted" boolean DEFAULT false NOT NULL,
	"waiverAccepted" boolean DEFAULT false NOT NULL,
	"waiverAcceptedAt" timestamp with time zone,
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
	"country" "CountryCode" DEFAULT 'US',
	"regionCode" text,
	"city" text,
	"tradeStartYear" integer,
	"tradeStartMonth" integer,
	"v2_extras" jsonb,
	"payoutMethod" text,
	"payoutStatus" text,
	"stripeAccountId" text,
	"isApproved" boolean DEFAULT true,
	"jobsCompleted" integer DEFAULT 0,
	"rating" double precision,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "JobPosterProfile" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"address" text,
	"city" text NOT NULL,
	"stateProvince" text NOT NULL,
	"postalCode" text,
	"country" "CountryCode" DEFAULT 'US' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"defaultJobLocation" text,
	"payoutMethod" "RolePayoutMethod",
	"payoutStatus" "RolePayoutStatus" DEFAULT 'UNSET' NOT NULL,
	"stripeAccountId" text,
	CONSTRAINT "JobPosterProfile_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "job_poster_profiles_v4" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"email" text,
	"avatar_url" text,
	"phone" text,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"city" text NOT NULL,
	"province_state" text NOT NULL,
	"postal_code" text NOT NULL,
	"country" text NOT NULL,
	"formatted_address" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"geocode_provider" text DEFAULT 'OSM' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "JobFlag" (
	"id" text PRIMARY KEY DEFAULT (gen_random_uuid())::text NOT NULL,
	"jobId" text NOT NULL,
	"userId" text,
	"reason" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contractor_profiles_v4" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"email" text,
	"avatar_url" text,
	"contact_name" text NOT NULL,
	"phone" text NOT NULL,
	"business_name" text NOT NULL,
	"business_number" text,
	"started_trade_year" integer,
	"started_trade_month" integer,
	"accepted_tos_at" timestamp,
	"tos_version" text,
	"street_address" text,
	"formatted_address" text,
	"years_experience" integer,
	"city" text,
	"postal_code" text,
	"country_code" text,
	"home_region_code" text,
	"trade_categories" jsonb NOT NULL,
	"service_radius_km" integer DEFAULT 25 NOT NULL,
	"home_latitude" double precision NOT NULL,
	"home_longitude" double precision NOT NULL,
	"stripe_connected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "router_profiles_v4" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"email" text,
	"avatar_url" text,
	"contact_name" text NOT NULL,
	"phone" text NOT NULL,
	"home_region" text NOT NULL,
	"home_country_code" text,
	"home_region_code" text,
	"service_areas" jsonb NOT NULL,
	"availability" jsonb NOT NULL,
	"home_latitude" double precision,
	"home_longitude" double precision,
	"rewards_balance_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_job_uploads" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"url" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"used_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "v4_appraisal_token_consumptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"consumed_at" timestamp DEFAULT now() NOT NULL,
	"job_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_rate_limit_buckets" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text NOT NULL,
	"job_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TransferRecord" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jobId" text NOT NULL,
	"role" text NOT NULL,
	"userId" text NOT NULL,
	"amountCents" integer NOT NULL,
	"currency" text NOT NULL,
	"method" text NOT NULL,
	"stripeTransferId" text,
	"externalRef" text,
	"status" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"releasedAt" timestamp with time zone,
	"failureReason" text
);
--> statement-breakpoint
CREATE TABLE "admin_router_contexts" (
	"id" text PRIMARY KEY NOT NULL,
	"adminId" text NOT NULL,
	"country" "CountryCode" NOT NULL,
	"regionCode" text NOT NULL,
	"routingHubId" text NOT NULL,
	"activatedAt" timestamp DEFAULT now() NOT NULL,
	"deactivatedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"jobId" text NOT NULL,
	"contractorUserId" text NOT NULL,
	"jobPosterUserId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversationId" text NOT NULL,
	"senderUserId" text NOT NULL,
	"senderRole" text NOT NULL,
	"body" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"readAt" timestamp,
	"createdByAdminUserId" text,
	"jobId" text
);
--> statement-breakpoint
CREATE TABLE "monitoring_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"type" "MonitoringEventType" NOT NULL,
	"jobId" text NOT NULL,
	"role" "MonitoringActorRole" NOT NULL,
	"userId" text,
	"handledAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "routing_hubs" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"country" "CountryCode" NOT NULL,
	"regionCode" text NOT NULL,
	"hubCity" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"isAdminOnly" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clerk_webhook_events" (
	"eventId" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "directory_engine"."backlinks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"directory_id" uuid NOT NULL,
	"listing_url" text,
	"verified" boolean DEFAULT false NOT NULL,
	"last_checked" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "directory_engine"."country_context" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country" text NOT NULL,
	"key_industries" jsonb,
	"workforce_trends" jsonb,
	"trade_demand" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "country_context_country_unique" UNIQUE("country")
);
--> statement-breakpoint
CREATE TABLE "directory_engine"."directories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"homepage_url" text,
	"submission_url" text,
	"contact_email" text,
	"region" text,
	"country" text,
	"category" text,
	"scope" text DEFAULT 'REGIONAL' NOT NULL,
	"target_url_override" text,
	"free" boolean,
	"requires_approval" boolean,
	"authority_score" integer,
	"status" text DEFAULT 'NEW' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "directory_engine"."regional_context" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"region" text NOT NULL,
	"country" text,
	"key_industries" jsonb,
	"top_trades" jsonb,
	"service_demand" jsonb,
	"population_traits" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "regional_context_region_unique" UNIQUE("region")
);
--> statement-breakpoint
CREATE TABLE "directory_engine"."submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"directory_id" uuid NOT NULL,
	"region" text,
	"generated_variants" jsonb,
	"selected_variant" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"listing_url" text,
	"target_url_override" text,
	"submitted_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "JobDraft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"status" "JobDraftStatus" DEFAULT 'ACTIVE' NOT NULL,
	"step" "JobDraftStep" DEFAULT 'DETAILS' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PmRequest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jobId" text NOT NULL,
	"contractorId" text NOT NULL,
	"jobPosterUserId" text NOT NULL,
	"initiatedBy" text NOT NULL,
	"status" "PMRequestStatus" DEFAULT 'DRAFT' NOT NULL,
	"autoTotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"manualTotal" numeric(12, 2),
	"approvedTotal" numeric(12, 2),
	"taxAmount" numeric(12, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"stripePaymentIntentId" text,
	"escrowId" uuid,
	"amendReason" text,
	"proposedBudget" numeric(12, 2),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PmLineItem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pmRequestId" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unitPrice" numeric(12, 2) NOT NULL,
	"url" text,
	"lineTotal" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PmReceipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pmRequestId" uuid NOT NULL,
	"fileBase64" text NOT NULL,
	"extractedTotal" numeric(12, 2),
	"verified" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text,
	"job_id" text NOT NULL,
	"from_user_id" text,
	"to_user_id" text,
	"sender_role" text DEFAULT 'SYSTEM' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "v4_message_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"job_poster_user_id" text NOT NULL,
	"contractor_user_id" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"ended_at" timestamp,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_messenger_appointments" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"scheduled_at_utc" timestamp NOT NULL,
	"status" text DEFAULT 'SCHEDULED' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_completion_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"submitted_by_role" text NOT NULL,
	"completed_at_utc" timestamp NOT NULL,
	"summary_text" text NOT NULL,
	"punctuality" integer,
	"communication" integer,
	"quality" integer,
	"cooperation" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_support_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"subject" text NOT NULL,
	"category" text NOT NULL,
	"ticket_type" text,
	"priority" text DEFAULT 'NORMAL' NOT NULL,
	"job_id" text,
	"adjustment_id" text,
	"body" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_job_price_adjustments" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"thread_id" text,
	"contractor_user_id" text NOT NULL,
	"job_poster_user_id" text NOT NULL,
	"support_ticket_id" text,
	"original_price_cents" integer,
	"requested_price_cents" integer NOT NULL,
	"difference_cents" integer,
	"contractor_scope_details" text NOT NULL,
	"additional_scope_details" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"secure_token" text,
	"token_expires_at" timestamp,
	"generated_by_admin_id" text,
	"generated_at" timestamp,
	"payment_intent_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"approved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "v4_support_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"sender_user_id" text NOT NULL,
	"sender_role" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_pm_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"contractor_user_id" text NOT NULL,
	"job_poster_user_id" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_pm_request_items" (
	"id" text PRIMARY KEY NOT NULL,
	"pm_request_id" text NOT NULL,
	"description" text NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"url" text,
	"unit_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(12, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'SYSTEM' NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"priority" text DEFAULT 'NORMAL' NOT NULL,
	"dedupe_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_notification_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"notification_type" text NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_event_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_appraisals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"jobs_evaluated" integer DEFAULT 0 NOT NULL,
	"avg_punctuality" double precision,
	"avg_communication" double precision,
	"avg_quality" double precision,
	"avg_cooperation" double precision,
	"total_score" double precision,
	"prompt_hash" text,
	"version" text DEFAULT 'v1' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_enforcement_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"job_id" text,
	"conversation_id" text,
	"category" text NOT NULL,
	"confidence" double precision NOT NULL,
	"severity" integer NOT NULL,
	"evidence_excerpt" text,
	"context_summary" text,
	"action_taken" text DEFAULT 'NONE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"job_id" text,
	"conversation_id" text,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"attachment_pointers" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_admin_users" (
	"id" text PRIMARY KEY DEFAULT (gen_random_uuid())::text NOT NULL,
	"auth_subject_id" uuid,
	"email" text NOT NULL,
	"role" text DEFAULT 'ADMIN' NOT NULL,
	"password_hash" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"name" text,
	"phone" text,
	"country" text,
	"state" text,
	"city" text,
	"first_name" text,
	"last_name" text,
	"suspended_until" timestamp with time zone,
	"suspension_reason" text,
	"archived_at" timestamp with time zone,
	"archived_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "v4_admin_users_auth_subject_id_unique" UNIQUE("auth_subject_id"),
	CONSTRAINT "v4_admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "v4_admin_bootstrap_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "v4_admin_bootstrap_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "v4_admin_invite_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "v4_admin_invite_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "v4_admin_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"title" text NOT NULL,
	"country" text NOT NULL,
	"province" text,
	"city" text,
	"address" text,
	"trade" text NOT NULL,
	"job_source" text DEFAULT 'REAL' NOT NULL,
	"routing_status" text DEFAULT 'UNROUTED' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"assignment_id" text,
	"assignment_status" text,
	"assignment_contractor_id" text,
	"assignment_contractor_name" text,
	"assignment_contractor_email" text,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"payment_status" text DEFAULT 'UNPAID' NOT NULL,
	"payout_status" text DEFAULT 'NOT_READY' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_admin_payout_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_email" text,
	"user_role" text,
	"amount_cents" integer NOT NULL,
	"status" text NOT NULL,
	"payout_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_admin_transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"role" text NOT NULL,
	"user_id" text NOT NULL,
	"user_email" text,
	"user_name" text,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"method" text NOT NULL,
	"stripe_transfer_id" text,
	"external_ref" text,
	"status" text NOT NULL,
	"failure_reason" text,
	"job_title" text,
	"created_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "v4_admin_disputes" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"job_id" text NOT NULL,
	"filed_by_user_id" text NOT NULL,
	"against_user_id" text NOT NULL,
	"against_role" text NOT NULL,
	"dispute_reason" text NOT NULL,
	"description" text NOT NULL,
	"status" text NOT NULL,
	"decision" text,
	"decision_summary" text,
	"decision_at" timestamp with time zone,
	"deadline_at" timestamp with time zone NOT NULL,
	"ticket_subject" text,
	"ticket_priority" text,
	"ticket_category" text,
	"ticket_status" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_admin_support_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"category" text NOT NULL,
	"priority" text NOT NULL,
	"role_context" text NOT NULL,
	"subject" text NOT NULL,
	"created_by_id" text NOT NULL,
	"assigned_to_id" text,
	"message_count" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_admin_integrity_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"severity" text DEFAULT 'MEDIUM' NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "v4_admin_payout_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" text NOT NULL,
	"user_id" text NOT NULL,
	"direction" text NOT NULL,
	"bucket" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_admin_sync_checkpoints" (
	"key" text PRIMARY KEY NOT NULL,
	"last_synced_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_contractor_strikes" (
	"id" text PRIMARY KEY NOT NULL,
	"contractor_user_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_contractor_suspensions" (
	"contractor_user_id" text PRIMARY KEY NOT NULL,
	"suspended_until" timestamp NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_tax_regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_code" text NOT NULL,
	"region_code" text NOT NULL,
	"region_name" text NOT NULL,
	"combined_rate" numeric(6, 3) DEFAULT '0' NOT NULL,
	"gst_rate" numeric(8, 6) DEFAULT '0' NOT NULL,
	"pst_rate" numeric(8, 6) DEFAULT '0' NOT NULL,
	"hst_rate" numeric(8, 6) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "v4_tax_regions_country_region_unique" UNIQUE("country_code","region_code")
);
--> statement-breakpoint
CREATE TABLE "v4_tax_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"tax_mode" text DEFAULT 'EXCLUSIVE' NOT NULL,
	"auto_apply_canada" boolean DEFAULT true NOT NULL,
	"apply_to_platform_fee" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_financial_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"type" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"stripe_ref" text,
	"dedupe_key" text,
	"meta_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_payment_fee_config" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_method" text NOT NULL,
	"percent_bps" integer NOT NULL,
	"fixed_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_router_reward_events" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"router_user_id" text NOT NULL,
	"event_type" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"job_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'STANDARD' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"disabled_at" timestamp,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "role_terms_acceptances" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"document_type" text NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_frontpage_ticker_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"message" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 1 NOT NULL,
	"interval_seconds" integer DEFAULT 6 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_contractor_trade_skills" (
	"id" text PRIMARY KEY NOT NULL,
	"contractor_user_id" text NOT NULL,
	"trade_category" text NOT NULL,
	"years_experience" integer NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "v4_contractor_trade_skills_contractor_user_id_trade_category_unique" UNIQUE("contractor_user_id","trade_category")
);
--> statement-breakpoint
CREATE TABLE "v4_contractor_certifications" (
	"id" text PRIMARY KEY NOT NULL,
	"contractor_user_id" text NOT NULL,
	"trade_skill_id" text NOT NULL,
	"certification_name" text NOT NULL,
	"issuing_organization" text,
	"certificate_image_url" text,
	"certificate_type" text,
	"issued_at" timestamp,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v4_notification_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"notification_type" text NOT NULL,
	"category" text DEFAULT 'System' NOT NULL,
	"email_subject" text,
	"email_template" text,
	"in_app_template" text,
	"enabled_email" boolean DEFAULT true NOT NULL,
	"enabled_in_app" boolean DEFAULT true NOT NULL,
	"supports_email" boolean DEFAULT true NOT NULL,
	"supports_in_app" boolean DEFAULT true NOT NULL,
	"variables" jsonb,
	"updated_at" timestamp,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "v4_notification_delivery_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"notification_id" text,
	"notification_type" text NOT NULL,
	"recipient_user_id" text NOT NULL,
	"recipient_email" text,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"error_message" text,
	"event_id" text,
	"dedupe_key" text,
	"is_test" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_settings" (
	"id" text PRIMARY KEY DEFAULT (gen_random_uuid())::text NOT NULL,
	"site_title" text,
	"site_description" text,
	"default_meta_title" text,
	"default_meta_description" text,
	"og_title" text,
	"og_description" text,
	"og_image" text,
	"twitter_card_image" text,
	"canonical_domain" text,
	"robots_txt" text,
	"page_templates" jsonb,
	"distribution_config" jsonb,
	"tracking_events" jsonb,
	"ga4_measurement_id" text,
	"meta_pixel_id" text,
	"index_now_key" text,
	"enable_google_indexing" boolean DEFAULT true,
	"enable_index_now" boolean DEFAULT true,
	"auto_index_new_jobs" boolean DEFAULT true,
	"facebook_url" text,
	"twitter_url" text,
	"linkedin_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "seo_templates" (
	"id" text PRIMARY KEY DEFAULT (gen_random_uuid())::text NOT NULL,
	"template_key" text NOT NULL,
	"title_template" text NOT NULL,
	"description_template" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seo_templates_template_key_unique" UNIQUE("template_key")
);
--> statement-breakpoint
CREATE TABLE "seo_index_queue" (
	"id" text PRIMARY KEY DEFAULT (gen_random_uuid())::text NOT NULL,
	"url" text NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "seo_indexing_log" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"engine" text NOT NULL,
	"status" text NOT NULL,
	"response_code" integer,
	"error_message" text,
	"triggered_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_sitemap_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"sitemap_type" "seo_sitemap_type" NOT NULL,
	"xml_content" text NOT NULL,
	"url_count" integer DEFAULT 0 NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_page_generation_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"city" text NOT NULL,
	"service" text NOT NULL,
	"slug" text NOT NULL,
	"template_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"preview_data" jsonb,
	"generated_content" jsonb,
	"requested_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "waitlist_subscribers" (
	"id" text PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"role_type" text NOT NULL,
	"is_confirmed" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'homepage',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_announcements" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"audience_type" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_jobId_jobs_id_fk" FOREIGN KEY ("jobId") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_escrowId_Escrow_id_fk" FOREIGN KEY ("escrowId") REFERENCES "public"."Escrow"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ContractorPayout" ADD CONSTRAINT "ContractorPayout_pmRequestId_PmRequest_id_fk" FOREIGN KEY ("pmRequestId") REFERENCES "public"."PmRequest"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_integrity_alerts" ADD CONSTRAINT "financial_integrity_alerts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_integrity_alerts" ADD CONSTRAINT "financial_integrity_alerts_resolved_by_admin_id_admins_id_fk" FOREIGN KEY ("resolved_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "JobFlag" ADD CONSTRAINT "JobFlag_jobId_jobs_id_fk" FOREIGN KEY ("jobId") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "JobFlag" ADD CONSTRAINT "JobFlag_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "TransferRecord" ADD CONSTRAINT "TransferRecord_jobId_jobs_id_fk" FOREIGN KEY ("jobId") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "TransferRecord" ADD CONSTRAINT "TransferRecord_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_engine"."backlinks" ADD CONSTRAINT "backlinks_directory_id_directories_id_fk" FOREIGN KEY ("directory_id") REFERENCES "directory_engine"."directories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_engine"."submissions" ADD CONSTRAINT "submissions_directory_id_directories_id_fk" FOREIGN KEY ("directory_id") REFERENCES "directory_engine"."directories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "PmRequest" ADD CONSTRAINT "PmRequest_jobId_jobs_id_fk" FOREIGN KEY ("jobId") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "PmRequest" ADD CONSTRAINT "PmRequest_escrowId_Escrow_id_fk" FOREIGN KEY ("escrowId") REFERENCES "public"."Escrow"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "PmLineItem" ADD CONSTRAINT "PmLineItem_pmRequestId_PmRequest_id_fk" FOREIGN KEY ("pmRequestId") REFERENCES "public"."PmRequest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "PmReceipt" ADD CONSTRAINT "PmReceipt_pmRequestId_PmRequest_id_fk" FOREIGN KEY ("pmRequestId") REFERENCES "public"."PmRequest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v4_messages" ADD CONSTRAINT "v4_messages_thread_id_v4_message_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."v4_message_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v4_messages" ADD CONSTRAINT "v4_messages_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v4_messages" ADD CONSTRAINT "v4_messages_from_user_id_User_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v4_messages" ADD CONSTRAINT "v4_messages_to_user_id_User_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v4_message_threads" ADD CONSTRAINT "v4_message_threads_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v4_message_threads" ADD CONSTRAINT "v4_message_threads_job_poster_user_id_User_id_fk" FOREIGN KEY ("job_poster_user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v4_message_threads" ADD CONSTRAINT "v4_message_threads_contractor_user_id_User_id_fk" FOREIGN KEY ("contractor_user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v4_messenger_appointments" ADD CONSTRAINT "v4_messenger_appointments_thread_id_v4_message_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."v4_message_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v4_completion_reports" ADD CONSTRAINT "v4_completion_reports_thread_id_v4_message_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."v4_message_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v4_support_tickets" ADD CONSTRAINT "v4_support_tickets_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v4_job_price_adjustments" ADD CONSTRAINT "v4_job_price_adjustments_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v4_support_messages" ADD CONSTRAINT "v4_support_messages_ticket_id_v4_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."v4_support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v4_pm_requests" ADD CONSTRAINT "v4_pm_requests_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v4_pm_requests" ADD CONSTRAINT "v4_pm_requests_contractor_user_id_User_id_fk" FOREIGN KEY ("contractor_user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v4_pm_requests" ADD CONSTRAINT "v4_pm_requests_job_poster_user_id_User_id_fk" FOREIGN KEY ("job_poster_user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v4_pm_request_items" ADD CONSTRAINT "v4_pm_request_items_pm_request_id_v4_pm_requests_id_fk" FOREIGN KEY ("pm_request_id") REFERENCES "public"."v4_pm_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_appraisals" ADD CONSTRAINT "score_appraisals_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_enforcement_events" ADD CONSTRAINT "ai_enforcement_events_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v4_contractor_strikes" ADD CONSTRAINT "v4_contractor_strikes_contractor_user_id_User_id_fk" FOREIGN KEY ("contractor_user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v4_contractor_suspensions" ADD CONSTRAINT "v4_contractor_suspensions_contractor_user_id_User_id_fk" FOREIGN KEY ("contractor_user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_terms_acceptances" ADD CONSTRAINT "role_terms_acceptances_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v4_contractor_trade_skills" ADD CONSTRAINT "v4_contractor_trade_skills_contractor_user_id_User_id_fk" FOREIGN KEY ("contractor_user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v4_contractor_certifications" ADD CONSTRAINT "v4_contractor_certifications_contractor_user_id_User_id_fk" FOREIGN KEY ("contractor_user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v4_contractor_certifications" ADD CONSTRAINT "v4_contractor_certifications_trade_skill_id_v4_contractor_trade_skills_id_fk" FOREIGN KEY ("trade_skill_id") REFERENCES "public"."v4_contractor_trade_skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_archived_idx" ON "jobs" USING btree ("archived");--> statement-breakpoint
CREATE INDEX "idx_jobs_status" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_jobs_routing_status" ON "jobs" USING btree ("routing_status");--> statement-breakpoint
CREATE INDEX "idx_jobs_payout_status" ON "jobs" USING btree ("payout_status");--> statement-breakpoint
CREATE INDEX "idx_jobs_created_at" ON "jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "job_edit_requests_job_id_idx" ON "job_edit_requests" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_edit_requests_job_poster_id_idx" ON "job_edit_requests" USING btree ("job_poster_id");--> statement-breakpoint
CREATE INDEX "job_edit_requests_status_idx" ON "job_edit_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "job_edit_requests_created_at_idx" ON "job_edit_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "job_cancel_requests_job_id_idx" ON "job_cancel_requests" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_cancel_requests_job_poster_id_idx" ON "job_cancel_requests" USING btree ("job_poster_id");--> statement-breakpoint
CREATE INDEX "job_cancel_requests_status_idx" ON "job_cancel_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "job_cancel_requests_created_at_idx" ON "job_cancel_requests" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ContractorPayout_pmRequestId_uq" ON "ContractorPayout" USING btree ("pmRequestId");--> statement-breakpoint
CREATE INDEX "stripe_charge_snapshots_status_idx" ON "stripe_charge_snapshots" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stripe_charge_snapshots_created_unix_idx" ON "stripe_charge_snapshots" USING btree ("created_unix");--> statement-breakpoint
CREATE INDEX "stripe_charge_snapshots_pi_idx" ON "stripe_charge_snapshots" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "stripe_charge_snapshots_job_idx" ON "stripe_charge_snapshots" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "stripe_charge_snapshots_last_synced_idx" ON "stripe_charge_snapshots" USING btree ("last_synced_at");--> statement-breakpoint
CREATE INDEX "stripe_events_log_type_idx" ON "stripe_events_log" USING btree ("type");--> statement-breakpoint
CREATE INDEX "stripe_events_log_received_at_idx" ON "stripe_events_log" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "stripe_pi_snapshots_status_idx" ON "stripe_payment_intent_snapshots" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stripe_pi_snapshots_created_unix_idx" ON "stripe_payment_intent_snapshots" USING btree ("created_unix");--> statement-breakpoint
CREATE INDEX "stripe_pi_snapshots_job_idx" ON "stripe_payment_intent_snapshots" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "stripe_pi_snapshots_last_synced_idx" ON "stripe_payment_intent_snapshots" USING btree ("last_synced_at");--> statement-breakpoint
CREATE INDEX "stripe_refund_snapshots_status_idx" ON "stripe_refund_snapshots" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stripe_refund_snapshots_created_unix_idx" ON "stripe_refund_snapshots" USING btree ("created_unix");--> statement-breakpoint
CREATE INDEX "stripe_refund_snapshots_charge_idx" ON "stripe_refund_snapshots" USING btree ("charge_id");--> statement-breakpoint
CREATE INDEX "stripe_refund_snapshots_pi_idx" ON "stripe_refund_snapshots" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "stripe_refund_snapshots_job_idx" ON "stripe_refund_snapshots" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "stripe_refund_snapshots_last_synced_idx" ON "stripe_refund_snapshots" USING btree ("last_synced_at");--> statement-breakpoint
CREATE INDEX "stripe_sync_runs_mode_idx" ON "stripe_sync_runs" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "stripe_sync_runs_created_at_idx" ON "stripe_sync_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "stripe_sync_runs_window_idx" ON "stripe_sync_runs" USING btree ("from_at","to_at");--> statement-breakpoint
CREATE INDEX "stripe_transfer_snapshots_status_idx" ON "stripe_transfer_snapshots" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stripe_transfer_snapshots_created_unix_idx" ON "stripe_transfer_snapshots" USING btree ("created_unix");--> statement-breakpoint
CREATE INDEX "stripe_transfer_snapshots_dest_idx" ON "stripe_transfer_snapshots" USING btree ("destination_account_id");--> statement-breakpoint
CREATE INDEX "stripe_transfer_snapshots_job_idx" ON "stripe_transfer_snapshots" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "stripe_transfer_snapshots_last_synced_idx" ON "stripe_transfer_snapshots" USING btree ("last_synced_at");--> statement-breakpoint
CREATE INDEX "financial_integrity_alerts_status_idx" ON "financial_integrity_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "financial_integrity_alerts_created_at_idx" ON "financial_integrity_alerts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "financial_integrity_alerts_job_id_idx" ON "financial_integrity_alerts" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "router_rewards_router_user_id_idx" ON "RouterReward" USING btree ("routerUserId");--> statement-breakpoint
CREATE UNIQUE INDEX "router_rewards_referred_user_id_unique" ON "RouterReward" USING btree ("referredUserId");--> statement-breakpoint
CREATE UNIQUE INDEX "JobDispatch_tokenHash_key" ON "JobDispatch" USING btree ("tokenHash");--> statement-breakpoint
CREATE INDEX "JobDispatch_jobId_status_createdAt_idx" ON "JobDispatch" USING btree ("jobId","status","createdAt");--> statement-breakpoint
CREATE INDEX "JobDispatch_contractorId_status_createdAt_idx" ON "JobDispatch" USING btree ("contractorId","status","createdAt");--> statement-breakpoint
CREATE INDEX "JobDispatch_routerUserId_status_createdAt_idx" ON "JobDispatch" USING btree ("routerUserId","status","createdAt");--> statement-breakpoint
CREATE INDEX "conversations_jobId_idx" ON "conversations" USING btree ("jobId");--> statement-breakpoint
CREATE INDEX "conversations_participants_idx" ON "conversations" USING btree ("contractorUserId","jobPosterUserId");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_job_participants_uniq" ON "conversations" USING btree ("jobId","contractorUserId","jobPosterUserId");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversationId","createdAt");--> statement-breakpoint
CREATE INDEX "notification_deliveries_user_created_idx" ON "notification_deliveries" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "notification_deliveries_user_read_idx" ON "notification_deliveries" USING btree ("userId","readAt");--> statement-breakpoint
CREATE UNIQUE INDEX "JobDraft_v3_one_active_per_user" ON "JobDraft" USING btree ("userId") WHERE "status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "PmRequest_jobId_idx" ON "PmRequest" USING btree ("jobId");--> statement-breakpoint
CREATE INDEX "PmRequest_status_idx" ON "PmRequest" USING btree ("status");--> statement-breakpoint
CREATE INDEX "PmLineItem_pmRequestId_idx" ON "PmLineItem" USING btree ("pmRequestId");--> statement-breakpoint
CREATE INDEX "PmReceipt_pmRequestId_idx" ON "PmReceipt" USING btree ("pmRequestId");--> statement-breakpoint
CREATE INDEX "v4_messages_job_idx" ON "v4_messages" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "v4_messages_thread_idx" ON "v4_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "v4_messages_from_to_idx" ON "v4_messages" USING btree ("from_user_id","to_user_id");--> statement-breakpoint
CREATE INDEX "v4_messages_sender_role_idx" ON "v4_messages" USING btree ("sender_role");--> statement-breakpoint
CREATE UNIQUE INDEX "v4_message_threads_job_participants_uniq" ON "v4_message_threads" USING btree ("job_id","job_poster_user_id","contractor_user_id");--> statement-breakpoint
CREATE INDEX "v4_message_threads_job_poster_idx" ON "v4_message_threads" USING btree ("job_poster_user_id");--> statement-breakpoint
CREATE INDEX "v4_message_threads_contractor_idx" ON "v4_message_threads" USING btree ("contractor_user_id");--> statement-breakpoint
CREATE INDEX "v4_message_threads_status_idx" ON "v4_message_threads" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "v4_messenger_appointments_thread_uniq" ON "v4_messenger_appointments" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "v4_messenger_appointments_status_idx" ON "v4_messenger_appointments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "v4_messenger_appointments_scheduled_idx" ON "v4_messenger_appointments" USING btree ("scheduled_at_utc");--> statement-breakpoint
CREATE UNIQUE INDEX "v4_completion_reports_thread_role_uniq" ON "v4_completion_reports" USING btree ("thread_id","submitted_by_role");--> statement-breakpoint
CREATE INDEX "v4_completion_reports_thread_idx" ON "v4_completion_reports" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "v4_support_tickets_user_idx" ON "v4_support_tickets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "v4_support_tickets_status_idx" ON "v4_support_tickets" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "v4_job_price_adj_job_contractor_uniq" ON "v4_job_price_adjustments" USING btree ("job_id","contractor_user_id");--> statement-breakpoint
CREATE INDEX "v4_job_price_adj_job_idx" ON "v4_job_price_adjustments" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "v4_job_price_adj_status_idx" ON "v4_job_price_adjustments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "v4_support_messages_ticket_idx" ON "v4_support_messages" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "v4_support_messages_sender_idx" ON "v4_support_messages" USING btree ("sender_user_id");--> statement-breakpoint
CREATE INDEX "v4_pm_requests_job_poster_idx" ON "v4_pm_requests" USING btree ("job_poster_user_id");--> statement-breakpoint
CREATE INDEX "v4_pm_request_items_pm_request_idx" ON "v4_pm_request_items" USING btree ("pm_request_id");--> statement-breakpoint
CREATE INDEX "v4_notifications_user_idx" ON "v4_notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "v4_notifications_user_role_created_idx" ON "v4_notifications" USING btree ("user_id","role","created_at");--> statement-breakpoint
CREATE INDEX "v4_notifications_read_idx" ON "v4_notifications" USING btree ("read");--> statement-breakpoint
CREATE INDEX "v4_notifications_read_at_idx" ON "v4_notifications" USING btree ("read_at");--> statement-breakpoint
CREATE INDEX "v4_notifications_priority_idx" ON "v4_notifications" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "v4_notifications_created_idx" ON "v4_notifications" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "v4_notifications_dedupe_key_uq" ON "v4_notifications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "v4_notification_preferences_user_role_idx" ON "v4_notification_preferences" USING btree ("user_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "v4_notification_preferences_user_role_type_uq" ON "v4_notification_preferences" USING btree ("user_id","role","notification_type");--> statement-breakpoint
CREATE UNIQUE INDEX "score_appraisals_user_role_uniq" ON "score_appraisals" USING btree ("user_id","role");--> statement-breakpoint
CREATE INDEX "score_appraisals_score_idx" ON "score_appraisals" USING btree ("total_score");--> statement-breakpoint
CREATE INDEX "ai_enforcement_events_user_idx" ON "ai_enforcement_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_enforcement_events_convo_idx" ON "ai_enforcement_events" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "ai_enforcement_events_job_idx" ON "ai_enforcement_events" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "disputes_user_idx" ON "disputes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "disputes_status_idx" ON "disputes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "disputes_conversation_idx" ON "disputes" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "disputes_job_idx" ON "disputes" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "v4_admin_users_email_idx" ON "v4_admin_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "v4_admin_users_role_idx" ON "v4_admin_users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "v4_admin_users_status_idx" ON "v4_admin_users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "v4_admin_bootstrap_tokens_hash_idx" ON "v4_admin_bootstrap_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "v4_admin_bootstrap_tokens_expires_idx" ON "v4_admin_bootstrap_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "v4_admin_invite_tokens_hash_idx" ON "v4_admin_invite_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "v4_admin_invite_tokens_email_idx" ON "v4_admin_invite_tokens" USING btree ("email");--> statement-breakpoint
CREATE INDEX "v4_admin_invite_tokens_expires_idx" ON "v4_admin_invite_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "v4_admin_jobs_status_idx" ON "v4_admin_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "v4_admin_jobs_country_province_idx" ON "v4_admin_jobs" USING btree ("country","province");--> statement-breakpoint
CREATE INDEX "v4_admin_jobs_trade_idx" ON "v4_admin_jobs" USING btree ("trade");--> statement-breakpoint
CREATE INDEX "v4_admin_jobs_created_at_idx" ON "v4_admin_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "v4_admin_payout_requests_status_idx" ON "v4_admin_payout_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "v4_admin_payout_requests_created_at_idx" ON "v4_admin_payout_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "v4_admin_payout_requests_user_idx" ON "v4_admin_payout_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "v4_admin_transfers_status_idx" ON "v4_admin_transfers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "v4_admin_transfers_created_at_idx" ON "v4_admin_transfers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "v4_admin_transfers_user_idx" ON "v4_admin_transfers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "v4_admin_disputes_status_idx" ON "v4_admin_disputes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "v4_admin_disputes_created_at_idx" ON "v4_admin_disputes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "v4_admin_disputes_job_idx" ON "v4_admin_disputes" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "v4_admin_support_tickets_status_idx" ON "v4_admin_support_tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "v4_admin_support_tickets_created_at_idx" ON "v4_admin_support_tickets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "v4_admin_support_tickets_priority_idx" ON "v4_admin_support_tickets" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "v4_admin_integrity_alerts_status_idx" ON "v4_admin_integrity_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "v4_admin_integrity_alerts_created_at_idx" ON "v4_admin_integrity_alerts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "v4_admin_integrity_alerts_severity_idx" ON "v4_admin_integrity_alerts" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "v4_admin_payout_adjustments_user_idx" ON "v4_admin_payout_adjustments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "v4_admin_payout_adjustments_created_at_idx" ON "v4_admin_payout_adjustments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "v4_contractor_strikes_contractor_idx" ON "v4_contractor_strikes" USING btree ("contractor_user_id");--> statement-breakpoint
CREATE INDEX "v4_tax_regions_country_region_idx" ON "v4_tax_regions" USING btree ("country_code","region_code");--> statement-breakpoint
CREATE INDEX "v4_tax_regions_active_idx" ON "v4_tax_regions" USING btree ("active");--> statement-breakpoint
CREATE INDEX "v4_financial_ledger_job_created_idx" ON "v4_financial_ledger" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX "v4_financial_ledger_type_created_idx" ON "v4_financial_ledger" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "v4_financial_ledger_stripe_ref_idx" ON "v4_financial_ledger" USING btree ("stripe_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "v4_financial_ledger_dedupe_key_uq" ON "v4_financial_ledger" USING btree ("dedupe_key") WHERE "v4_financial_ledger"."dedupe_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "v4_financial_ledger_job_type_ref_uq" ON "v4_financial_ledger" USING btree ("job_id","type","stripe_ref") WHERE "v4_financial_ledger"."stripe_ref" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "v4_payment_fee_config_method_uq" ON "v4_payment_fee_config" USING btree ("payment_method");--> statement-breakpoint
CREATE INDEX "idx_router_reward_events_user" ON "v4_router_reward_events" USING btree ("router_user_id");--> statement-breakpoint
CREATE INDEX "role_terms_acceptances_user_role_doc_accepted_idx" ON "role_terms_acceptances" USING btree ("user_id","role","document_type","accepted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "role_terms_acceptances_user_role_doc_version_uq" ON "role_terms_acceptances" USING btree ("user_id","role","document_type","version");--> statement-breakpoint
CREATE INDEX "trade_skill_lookup_idx" ON "v4_contractor_trade_skills" USING btree ("trade_category","approved");--> statement-breakpoint
CREATE UNIQUE INDEX "v4_notification_templates_type_uq" ON "v4_notification_templates" USING btree ("notification_type");--> statement-breakpoint
CREATE INDEX "v4_notification_templates_category_idx" ON "v4_notification_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "v4_notif_delivery_recipient_created_idx" ON "v4_notification_delivery_logs" USING btree ("recipient_user_id","created_at");--> statement-breakpoint
CREATE INDEX "v4_notif_delivery_type_status_idx" ON "v4_notification_delivery_logs" USING btree ("notification_type","status");--> statement-breakpoint
CREATE INDEX "v4_notif_delivery_is_test_created_idx" ON "v4_notification_delivery_logs" USING btree ("is_test","created_at");--> statement-breakpoint
CREATE INDEX "v4_notif_delivery_created_idx" ON "v4_notification_delivery_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "v4_notif_delivery_channel_status_idx" ON "v4_notification_delivery_logs" USING btree ("channel","status");--> statement-breakpoint
CREATE INDEX "seo_settings_updated_at_idx" ON "seo_settings" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seo_templates_template_key_uq" ON "seo_templates" USING btree ("template_key");--> statement-breakpoint
CREATE INDEX "seo_index_queue_url_idx" ON "seo_index_queue" USING btree ("url");--> statement-breakpoint
CREATE INDEX "seo_index_queue_processed_at_idx" ON "seo_index_queue" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "seo_indexing_log_engine_created_idx" ON "seo_indexing_log" USING btree ("engine","created_at");--> statement-breakpoint
CREATE INDEX "seo_indexing_log_status_created_idx" ON "seo_indexing_log" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "seo_indexing_log_created_idx" ON "seo_indexing_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seo_sitemap_cache_type_uq" ON "seo_sitemap_cache" USING btree ("sitemap_type");--> statement-breakpoint
CREATE UNIQUE INDEX "seo_page_unique_slug" ON "seo_page_generation_queue" USING btree ("slug");