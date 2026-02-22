-- Canonical schema normalization: Job + JobPhoto → plural snake_case tables, snake_case columns.
-- No quoted identifiers. Prisma legacy removed.
--
-- Phase 3: Safe renaming (table rename + column renames).
-- Run after 0053_v3_financial_policy_refinement.sql.

-- =============================================================================
-- 1) Job table: rename to jobs, then rename camelCase columns to snake_case
-- =============================================================================

ALTER TABLE "Job" RENAME TO jobs;

-- Job columns (only camelCase → snake_case; id, title, scope, etc. already lowercase)
ALTER TABLE jobs RENAME COLUMN "countryCode" TO country_code;
ALTER TABLE jobs RENAME COLUMN "stateCode" TO state_code;
ALTER TABLE jobs RENAME COLUMN "regionCode" TO region_code;
ALTER TABLE jobs RENAME COLUMN "regionName" TO region_name;
ALTER TABLE jobs RENAME COLUMN "postalCode" TO postal_code;
ALTER TABLE jobs RENAME COLUMN "addressFull" TO address_full;
ALTER TABLE jobs RENAME COLUMN "aiAppraisalStatus" TO ai_appraisal_status;
ALTER TABLE jobs RENAME COLUMN "aiAppraisedAt" TO ai_appraised_at;
ALTER TABLE jobs RENAME COLUMN "aiSuggestedTotal" TO ai_suggested_total;
ALTER TABLE jobs RENAME COLUMN "aiPriceRangeLow" TO ai_price_range_low;
ALTER TABLE jobs RENAME COLUMN "aiPriceRangeHigh" TO ai_price_range_high;
ALTER TABLE jobs RENAME COLUMN "aiConfidence" TO ai_confidence;
ALTER TABLE jobs RENAME COLUMN "aiReasoning" TO ai_reasoning;
ALTER TABLE jobs RENAME COLUMN "pricingIntel" TO pricing_intel;
ALTER TABLE jobs RENAME COLUMN "pricingIntelGeneratedAt" TO pricing_intel_generated_at;
ALTER TABLE jobs RENAME COLUMN "pricingIntelModel" TO pricing_intel_model;
ALTER TABLE jobs RENAME COLUMN "supersededByJobId" TO superseded_by_job_id;
ALTER TABLE jobs RENAME COLUMN "isMock" TO is_mock;
ALTER TABLE jobs RENAME COLUMN "mockSeedBatch" TO mock_seed_batch;
ALTER TABLE jobs RENAME COLUMN "publicStatus" TO public_status;
ALTER TABLE jobs RENAME COLUMN "jobSource" TO job_source;
ALTER TABLE jobs RENAME COLUMN "repeatContractorDiscountCents" TO repeat_contractor_discount_cents;
ALTER TABLE jobs RENAME COLUMN "serviceType" TO service_type;
ALTER TABLE jobs RENAME COLUMN "tradeCategory" TO trade_category;
ALTER TABLE jobs RENAME COLUMN "timeWindow" TO time_window;
ALTER TABLE jobs RENAME COLUMN "routerEarningsCents" TO router_earnings_cents;
ALTER TABLE jobs RENAME COLUMN "brokerFeeCents" TO broker_fee_cents;
ALTER TABLE jobs RENAME COLUMN "contractorPayoutCents" TO contractor_payout_cents;
ALTER TABLE jobs RENAME COLUMN "laborTotalCents" TO labor_total_cents;
ALTER TABLE jobs RENAME COLUMN "materialsTotalCents" TO materials_total_cents;
ALTER TABLE jobs RENAME COLUMN "transactionFeeCents" TO transaction_fee_cents;
ALTER TABLE jobs RENAME COLUMN "paymentStatus" TO payment_status;
ALTER TABLE jobs RENAME COLUMN "payoutStatus" TO payout_status;
ALTER TABLE jobs RENAME COLUMN "amountCents" TO amount_cents;
ALTER TABLE jobs RENAME COLUMN "paymentCurrency" TO payment_currency;
ALTER TABLE jobs RENAME COLUMN "stripePaymentIntentId" TO stripe_payment_intent_id;
ALTER TABLE jobs RENAME COLUMN "stripeChargeId" TO stripe_charge_id;
ALTER TABLE jobs RENAME COLUMN "stripeCustomerId" TO stripe_customer_id;
ALTER TABLE jobs RENAME COLUMN "stripePaymentMethodId" TO stripe_payment_method_id;
ALTER TABLE jobs RENAME COLUMN "acceptedAt" TO accepted_at;
ALTER TABLE jobs RENAME COLUMN "authorizationExpiresAt" TO authorization_expires_at;
ALTER TABLE jobs RENAME COLUMN "fundsSecuredAt" TO funds_secured_at;
ALTER TABLE jobs RENAME COLUMN "completionDeadlineAt" TO completion_deadline_at;
ALTER TABLE jobs RENAME COLUMN "fundedAt" TO funded_at;
ALTER TABLE jobs RENAME COLUMN "releasedAt" TO released_at;
ALTER TABLE jobs RENAME COLUMN "refundedAt" TO refunded_at;
ALTER TABLE jobs RENAME COLUMN "contractorTransferId" TO contractor_transfer_id;
ALTER TABLE jobs RENAME COLUMN "routerTransferId" TO router_transfer_id;
ALTER TABLE jobs RENAME COLUMN "escrowLockedAt" TO escrow_locked_at;
ALTER TABLE jobs RENAME COLUMN "paymentCapturedAt" TO payment_captured_at;
ALTER TABLE jobs RENAME COLUMN "paymentReleasedAt" TO payment_released_at;
ALTER TABLE jobs RENAME COLUMN "priceMedianCents" TO price_median_cents;
ALTER TABLE jobs RENAME COLUMN "priceAdjustmentCents" TO price_adjustment_cents;
ALTER TABLE jobs RENAME COLUMN "pricingVersion" TO pricing_version;
ALTER TABLE jobs RENAME COLUMN "junkHaulingItems" TO junk_hauling_items;
ALTER TABLE jobs RENAME COLUMN "jobType" TO job_type;
ALTER TABLE jobs RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE jobs RENAME COLUMN "publishedAt" TO published_at;
ALTER TABLE jobs RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE jobs RENAME COLUMN "jobPosterUserId" TO job_poster_user_id;
ALTER TABLE jobs RENAME COLUMN "contactedAt" TO contacted_at;
ALTER TABLE jobs RENAME COLUMN "guaranteeEligibleAt" TO guarantee_eligible_at;
ALTER TABLE jobs RENAME COLUMN "claimedAt" TO claimed_at;
ALTER TABLE jobs RENAME COLUMN "claimedByUserId" TO claimed_by_user_id;
ALTER TABLE jobs RENAME COLUMN "adminRoutedById" TO admin_routed_by_id;
ALTER TABLE jobs RENAME COLUMN "contractorUserId" TO contractor_user_id;
ALTER TABLE jobs RENAME COLUMN "postedAt" TO posted_at;
ALTER TABLE jobs RENAME COLUMN "routingDueAt" TO routing_due_at;
ALTER TABLE jobs RENAME COLUMN "firstRoutedAt" TO first_routed_at;
ALTER TABLE jobs RENAME COLUMN "routingStatus" TO routing_status;
ALTER TABLE jobs RENAME COLUMN "failsafeRouting" TO failsafe_routing;
ALTER TABLE jobs RENAME COLUMN "routedAt" TO routed_at;
ALTER TABLE jobs RENAME COLUMN "contractorCompletedAt" TO contractor_completed_at;
ALTER TABLE jobs RENAME COLUMN "contractorCompletionSummary" TO contractor_completion_summary;
ALTER TABLE jobs RENAME COLUMN "customerApprovedAt" TO customer_approved_at;
ALTER TABLE jobs RENAME COLUMN "customerRejectedAt" TO customer_rejected_at;
ALTER TABLE jobs RENAME COLUMN "customerRejectReason" TO customer_reject_reason;
ALTER TABLE jobs RENAME COLUMN "customerRejectNotes" TO customer_reject_notes;
ALTER TABLE jobs RENAME COLUMN "customerFeedback" TO customer_feedback;
ALTER TABLE jobs RENAME COLUMN "customerCompletionSummary" TO customer_completion_summary;
ALTER TABLE jobs RENAME COLUMN "routerApprovedAt" TO router_approved_at;
ALTER TABLE jobs RENAME COLUMN "routerApprovalNotes" TO router_approval_notes;
ALTER TABLE jobs RENAME COLUMN "completionFlaggedAt" TO completion_flagged_at;
ALTER TABLE jobs RENAME COLUMN "completionFlagReason" TO completion_flag_reason;
ALTER TABLE jobs RENAME COLUMN "contractorActionTokenHash" TO contractor_action_token_hash;
ALTER TABLE jobs RENAME COLUMN "customerActionTokenHash" TO customer_action_token_hash;
ALTER TABLE jobs RENAME COLUMN "estimatedCompletionDate" TO estimated_completion_date;
ALTER TABLE jobs RENAME COLUMN "estimateSetAt" TO estimate_set_at;
ALTER TABLE jobs RENAME COLUMN "estimateUpdatedAt" TO estimate_updated_at;
ALTER TABLE jobs RENAME COLUMN "estimateUpdateReason" TO estimate_update_reason;
ALTER TABLE jobs RENAME COLUMN "estimateUpdateOtherText" TO estimate_update_other_text;

-- Rename index to match (Job_archived_idx → jobs_archived_idx)
ALTER INDEX IF EXISTS "Job_archived_idx" RENAME TO jobs_archived_idx;

-- =============================================================================
-- 2) JobPhoto table: rename to job_photos, then rename camelCase columns
-- =============================================================================

ALTER TABLE "JobPhoto" RENAME TO job_photos;

ALTER TABLE job_photos RENAME COLUMN "jobId" TO job_id;
ALTER TABLE job_photos RENAME COLUMN "storageKey" TO storage_key;
ALTER TABLE job_photos RENAME COLUMN "createdAt" TO created_at;
