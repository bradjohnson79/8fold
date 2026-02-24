# Schema Drift — Ranked Report

Generated: 2026-02-23T22:30:47.462Z

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 29 |
| HIGH     | 36 |
| MEDIUM   | 5 |
| LOW      | 29 |
| **Total** | **99** |

---

## CRITICAL (29)

- **MISSING_TABLE_IN_DB** | admin_router_contexts | - | Drizzle table public.admin_router_contexts does not exist in database
- **MISSING_TABLE_IN_DB** | clerk_webhook_events | - | Drizzle table public.clerk_webhook_events does not exist in database
- **MISSING_COLUMN_IN_DB** | ContractorPayout | materialsRequestId | Column materialsRequestId in Drizzle does not exist in DB
- **MISSING_COLUMN_IN_DB** | Contractor | stripeAccountId | Column stripeAccountId in Drizzle does not exist in DB
- **MISSING_COLUMN_IN_DB** | Contractor | stripePayoutsEnabled | Column stripePayoutsEnabled in Drizzle does not exist in DB
- **MISSING_TABLE_IN_DB** | internal_account_flags | - | Drizzle table public.internal_account_flags does not exist in database
- **MISSING_TABLE_IN_DB** | JobFlag | - | Drizzle table public.JobFlag does not exist in database
- **MISSING_COLUMN_IN_DB** | JobHold | sourceDisputeCaseId | Column sourceDisputeCaseId in Drizzle does not exist in DB
- **MISSING_TABLE_IN_DB** | JobPosterCredit | - | Drizzle table public.JobPosterCredit does not exist in database
- **MISSING_TABLE_IN_DB** | job_posters | - | Drizzle table public.job_posters does not exist in database
- **MISSING_COLUMN_IN_DB** | MaterialsEscrow | overageCents | Column overageCents in Drizzle does not exist in DB
- **MISSING_COLUMN_IN_DB** | MaterialsEscrow | posterCreditCents | Column posterCreditCents in Drizzle does not exist in DB
- **MISSING_COLUMN_IN_DB** | MaterialsEscrow | posterRefundCents | Column posterRefundCents in Drizzle does not exist in DB
- **MISSING_COLUMN_IN_DB** | MaterialsEscrow | receiptTotalCents | Column receiptTotalCents in Drizzle does not exist in DB
- **MISSING_COLUMN_IN_DB** | MaterialsEscrow | reimbursedAmountCents | Column reimbursedAmountCents in Drizzle does not exist in DB
- **MISSING_COLUMN_IN_DB** | MaterialsEscrow | remainderCents | Column remainderCents in Drizzle does not exist in DB
- **MISSING_TABLE_IN_DB** | MaterialsPayment | - | Drizzle table public.MaterialsPayment does not exist in database
- **MISSING_TABLE_IN_DB** | MaterialsReceiptFile | - | Drizzle table public.MaterialsReceiptFile does not exist in database
- **MISSING_TABLE_IN_DB** | MaterialsReceiptSubmission | - | Drizzle table public.MaterialsReceiptSubmission does not exist in database
- **MISSING_TABLE_IN_DB** | monitoring_events | - | Drizzle table public.monitoring_events does not exist in database
- **MISSING_TABLE_IN_DB** | notification_deliveries | - | Drizzle table public.notification_deliveries does not exist in database
- **MISSING_TABLE_IN_DB** | RepeatContractorRequest | - | Drizzle table public.RepeatContractorRequest does not exist in database
- **MISSING_COLUMN_IN_DB** | RouterProfile | address | Column address in Drizzle does not exist in DB
- **MISSING_COLUMN_IN_DB** | RouterProfile | city | Column city in Drizzle does not exist in DB
- **MISSING_COLUMN_IN_DB** | RouterProfile | stateProvince | Column stateProvince in Drizzle does not exist in DB
- **MISSING_COLUMN_IN_DB** | RouterProfile | postalCode | Column postalCode in Drizzle does not exist in DB
- **MISSING_COLUMN_IN_DB** | RouterProfile | country | Column country in Drizzle does not exist in DB
- **MISSING_TABLE_IN_DB** | RouterReward | - | Drizzle table public.RouterReward does not exist in database
- **MISSING_TABLE_IN_DB** | routing_hubs | - | Drizzle table public.routing_hubs does not exist in database

## HIGH (36)

- **NULLABLE_MISMATCH** | directories | scope | Drizzle NOT NULL, DB allows NULL
- **DEFAULT_MISMATCH** | JobDispatch | updatedAt | Drizzle has default, DB has no default for NOT NULL column
- **NULLABLE_MISMATCH** | jobs | currency | Drizzle NOT NULL, DB allows NULL
- **NULLABLE_MISMATCH** | jobs | ai_appraisal_status | Drizzle NOT NULL, DB allows NULL
- **DEFAULT_MISMATCH** | jobs | ai_appraisal_status | Drizzle has default, DB has no default for NOT NULL column
- **NULLABLE_MISMATCH** | jobs | is_mock | Drizzle NOT NULL, DB allows NULL
- **DEFAULT_MISMATCH** | jobs | is_mock | Drizzle has default, DB has no default for NOT NULL column
- **NULLABLE_MISMATCH** | jobs | job_source | Drizzle NOT NULL, DB allows NULL
- **DEFAULT_MISMATCH** | jobs | job_source | Drizzle has default, DB has no default for NOT NULL column
- **NULLABLE_MISMATCH** | jobs | repeat_contractor_discount_cents | Drizzle NOT NULL, DB allows NULL
- **DEFAULT_MISMATCH** | jobs | repeat_contractor_discount_cents | Drizzle has default, DB has no default for NOT NULL column
- **NULLABLE_MISMATCH** | jobs | payout_status | Drizzle NOT NULL, DB allows NULL
- **DEFAULT_MISMATCH** | jobs | payout_status | Drizzle has default, DB has no default for NOT NULL column
- **NULLABLE_MISMATCH** | jobs | payment_currency | Drizzle NOT NULL, DB allows NULL
- **DEFAULT_MISMATCH** | jobs | payment_currency | Drizzle has default, DB has no default for NOT NULL column
- **NULLABLE_MISMATCH** | jobs | pricing_version | Drizzle NOT NULL, DB allows NULL
- **DEFAULT_MISMATCH** | jobs | pricing_version | Drizzle has default, DB has no default for NOT NULL column
- **NULLABLE_MISMATCH** | jobs | updated_at | Drizzle NOT NULL, DB allows NULL
- **DEFAULT_MISMATCH** | jobs | updated_at | Drizzle has default, DB has no default for NOT NULL column
- **NULLABLE_MISMATCH** | jobs | posted_at | Drizzle NOT NULL, DB allows NULL
- **DEFAULT_MISMATCH** | jobs | posted_at | Drizzle has default, DB has no default for NOT NULL column
- **NULLABLE_MISMATCH** | jobs | routing_status | Drizzle NOT NULL, DB allows NULL
- **DEFAULT_MISMATCH** | jobs | routing_status | Drizzle has default, DB has no default for NOT NULL column
- **NULLABLE_MISMATCH** | jobs | failsafe_routing | Drizzle NOT NULL, DB allows NULL
- **DEFAULT_MISMATCH** | jobs | failsafe_routing | Drizzle has default, DB has no default for NOT NULL column
- **NULLABLE_MISMATCH** | User | clerkUserId | Drizzle NOT NULL, DB allows NULL
- **NULLABLE_MISMATCH** | User | status | Drizzle NOT NULL, DB allows NULL
- **NULLABLE_MISMATCH** | User | formattedAddress | Drizzle NOT NULL, DB allows NULL
- **NULLABLE_MISMATCH** | User | legalStreet | Drizzle NOT NULL, DB allows NULL
- **NULLABLE_MISMATCH** | User | legalCity | Drizzle NOT NULL, DB allows NULL
- **NULLABLE_MISMATCH** | User | legalProvince | Drizzle NOT NULL, DB allows NULL
- **NULLABLE_MISMATCH** | User | legalPostalCode | Drizzle NOT NULL, DB allows NULL
- **NULLABLE_MISMATCH** | User | legalCountry | Drizzle NOT NULL, DB allows NULL
- **NULLABLE_MISMATCH** | User | accountStatus | Drizzle NOT NULL, DB allows NULL
- **NULLABLE_MISMATCH** | User | updatedAt | Drizzle NOT NULL, DB allows NULL
- **DEFAULT_MISMATCH** | User | updatedAt | Drizzle has default, DB has no default for NOT NULL column

## MEDIUM (5)

- **EXTRA_COLUMN_IN_DB** | RouterProfile | state | DB has column state not in Drizzle schema
- **EXTRA_COLUMN_IN_DB** | RouterProfile | status | DB has column status not in Drizzle schema
- **EXTRA_COLUMN_IN_DB** | RouterProfile | notifyViaEmail | DB has column notifyViaEmail not in Drizzle schema
- **EXTRA_COLUMN_IN_DB** | RouterProfile | notifyViaSms | DB has column notifyViaSms not in Drizzle schema
- **EXTRA_COLUMN_IN_DB** | RouterProfile | phone | DB has column phone not in Drizzle schema

## LOW (29)

- **EXTRA_TABLE_IN_DB** | AdminAdjustmentIdempotency | - | DB has table public.AdminAdjustmentIdempotency not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | AdminInvite | - | DB has table public.AdminInvite not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | AdminUser | - | DB has table public.AdminUser not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | AuthToken | - | DB has table public.AuthToken not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | Escrow | - | DB has table public.Escrow not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | JobDraftV2 | - | DB has table public.JobDraftV2 not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | JobDraftV2FieldState | - | DB has table public.JobDraftV2FieldState not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | JobDraft_legacy_frozen | - | DB has table public.JobDraft_legacy_frozen not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | PartsMaterialRequest | - | DB has table public.PartsMaterialRequest not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | Session | - | DB has table public.Session not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | _prisma_migrations | - | DB has table public._prisma_migrations not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | admin_sessions | - | DB has table public.admin_sessions not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | agent_mission_templates | - | DB has table public.agent_mission_templates not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | agent_schedule_plans | - | DB has table public.agent_schedule_plans not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | agent_scheduled_runs | - | DB has table public.agent_scheduled_runs not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | campaign_regions | - | DB has table public.campaign_regions not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | contacts | - | DB has table public.contacts not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | discovery_batches | - | DB has table public.discovery_batches not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | discovery_items | - | DB has table public.discovery_items not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | dispute_evidence | - | DB has table public.dispute_evidence not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | dispute_votes | - | DB has table public.dispute_votes not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | drizzle_sql_migrations | - | DB has table public.drizzle_sql_migrations not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | email_drafts | - | DB has table public.email_drafts not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | email_identities | - | DB has table public.email_identities not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | job_poster_accounts | - | DB has table public.job_poster_accounts not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | region_email_logs | - | DB has table public.region_email_logs not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | send_counters | - | DB has table public.send_counters not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | send_queue | - | DB has table public.send_queue not in Drizzle schema
- **EXTRA_TABLE_IN_DB** | sessions | - | DB has table public.sessions not in Drizzle schema
