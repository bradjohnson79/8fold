#!/usr/bin/env node
/**
 * Replace jobs.camelCase with jobs.snake_case in apps/api
 */
import fs from "fs";
import path from "path";

const mapping = [
  ["countryCode", "country_code"],
  ["stateCode", "state_code"],
  ["regionCode", "region_code"],
  ["regionName", "region_name"],
  ["postalCode", "postal_code"],
  ["addressFull", "address_full"],
  ["aiAppraisalStatus", "ai_appraisal_status"],
  ["aiAppraisedAt", "ai_appraised_at"],
  ["aiSuggestedTotal", "ai_suggested_total"],
  ["aiPriceRangeLow", "ai_price_range_low"],
  ["aiPriceRangeHigh", "ai_price_range_high"],
  ["aiConfidence", "ai_confidence"],
  ["aiReasoning", "ai_reasoning"],
  ["pricingIntel", "pricing_intel"],
  ["pricingIntelGeneratedAt", "pricing_intel_generated_at"],
  ["pricingIntelModel", "pricing_intel_model"],
  ["supersededByJobId", "superseded_by_job_id"],
  ["isMock", "is_mock"],
  ["mockSeedBatch", "mock_seed_batch"],
  ["publicStatus", "public_status"],
  ["jobSource", "job_source"],
  ["repeatContractorDiscountCents", "repeat_contractor_discount_cents"],
  ["serviceType", "service_type"],
  ["tradeCategory", "trade_category"],
  ["timeWindow", "time_window"],
  ["routerEarningsCents", "router_earnings_cents"],
  ["brokerFeeCents", "broker_fee_cents"],
  ["contractorPayoutCents", "contractor_payout_cents"],
  ["laborTotalCents", "labor_total_cents"],
  ["materialsTotalCents", "materials_total_cents"],
  ["transactionFeeCents", "transaction_fee_cents"],
  ["paymentStatus", "payment_status"],
  ["payoutStatus", "payout_status"],
  ["amountCents", "amount_cents"],
  ["paymentCurrency", "payment_currency"],
  ["stripePaymentIntentId", "stripe_payment_intent_id"],
  ["stripeChargeId", "stripe_charge_id"],
  ["stripeCustomerId", "stripe_customer_id"],
  ["stripePaymentMethodId", "stripe_payment_method_id"],
  ["acceptedAt", "accepted_at"],
  ["authorizationExpiresAt", "authorization_expires_at"],
  ["fundsSecuredAt", "funds_secured_at"],
  ["completionDeadlineAt", "completion_deadline_at"],
  ["fundedAt", "funded_at"],
  ["releasedAt", "released_at"],
  ["refundedAt", "refunded_at"],
  ["contractorTransferId", "contractor_transfer_id"],
  ["routerTransferId", "router_transfer_id"],
  ["escrowLockedAt", "escrow_locked_at"],
  ["paymentCapturedAt", "payment_captured_at"],
  ["paymentReleasedAt", "payment_released_at"],
  ["priceMedianCents", "price_median_cents"],
  ["priceAdjustmentCents", "price_adjustment_cents"],
  ["pricingVersion", "pricing_version"],
  ["junkHaulingItems", "junk_hauling_items"],
  ["jobType", "job_type"],
  ["createdAt", "created_at"],
  ["publishedAt", "published_at"],
  ["updatedAt", "updated_at"],
  ["jobPosterUserId", "job_poster_user_id"],
  ["contactedAt", "contacted_at"],
  ["guaranteeEligibleAt", "guarantee_eligible_at"],
  ["claimedAt", "claimed_at"],
  ["claimedByUserId", "claimed_by_user_id"],
  ["adminRoutedById", "admin_routed_by_id"],
  ["contractorUserId", "contractor_user_id"],
  ["postedAt", "posted_at"],
  ["routingDueAt", "routing_due_at"],
  ["firstRoutedAt", "first_routed_at"],
  ["routingStatus", "routing_status"],
  ["failsafeRouting", "failsafe_routing"],
  ["routedAt", "routed_at"],
  ["contractorCompletedAt", "contractor_completed_at"],
  ["contractorCompletionSummary", "contractor_completion_summary"],
  ["customerApprovedAt", "customer_approved_at"],
  ["customerRejectedAt", "customer_rejected_at"],
  ["customerRejectReason", "customer_reject_reason"],
  ["customerRejectNotes", "customer_reject_notes"],
  ["customerFeedback", "customer_feedback"],
  ["customerCompletionSummary", "customer_completion_summary"],
  ["routerApprovedAt", "router_approved_at"],
  ["routerApprovalNotes", "router_approval_notes"],
  ["completionFlaggedAt", "completion_flagged_at"],
  ["completionFlagReason", "completion_flag_reason"],
  ["contractorActionTokenHash", "contractor_action_token_hash"],
  ["customerActionTokenHash", "customer_action_token_hash"],
  ["estimatedCompletionDate", "estimated_completion_date"],
  ["estimateSetAt", "estimate_set_at"],
  ["estimateUpdatedAt", "estimate_updated_at"],
  ["estimateUpdateReason", "estimate_update_reason"],
  ["estimateUpdateOtherText", "estimate_update_other_text"],
];

function walk(dir, fn) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") {
      walk(p, fn);
    } else if (e.isFile() && (e.name.endsWith(".ts") || e.name.endsWith(".tsx"))) {
      fn(p);
    }
  }
}

const apiDir = path.join(process.cwd(), "apps/api");
let total = 0;
walk(apiDir, (file) => {
  let content = fs.readFileSync(file, "utf8");
  let changed = false;
  // 1) jobs.columnName (schema refs)
  for (const [from, to] of mapping) {
    const re = new RegExp(`jobs\\.${from}\\b`, "g");
    if (re.test(content)) {
      content = content.replace(re, `jobs.${to}`);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(file, content);
    total++;
    console.log(file);
  }
});
console.log(`Updated ${total} files`);
