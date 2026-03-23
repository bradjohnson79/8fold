/**
 * LGS (Directory Intelligence & Submission Engine) schema.
 *
 * Isolation boundary:
 * - This schema is owned by LGS and lives ONLY in Postgres schema `directory_engine`.
 * - LGS tables must not depend on Jobs lifecycle, Ledger, or Stripe/payments tables.
 * - LGS code should write ONLY through these table definitions (no cross-schema writes).
 */
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgSchema,
  serial,
  text,
  timestamp as pgTimestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const directoryEngineSchema = pgSchema("directory_engine");

function timestamp(
  name: string,
  config?: { mode?: "date" | "string"; withTimezone?: boolean }
) {
  return pgTimestamp(name, { withTimezone: true, ...config });
}

export const directories = directoryEngineSchema.table("directories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  homepageUrl: text("homepage_url"),
  submissionUrl: text("submission_url"),
  contactEmail: text("contact_email"),
  region: text("region"),
  country: text("country"),
  category: text("category"), // GENERAL | TRADE | STARTUP | LOCAL | TECH
  scope: text("scope").notNull().default("REGIONAL"), // REGIONAL | NATIONAL
  targetUrlOverride: text("target_url_override"),
  free: boolean("free"),
  requiresApproval: boolean("requires_approval"),
  authorityScore: integer("authority_score"),
  status: text("status").notNull().default("NEW"), // NEW | REVIEWED | APPROVED | REJECTED
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const countryContext = directoryEngineSchema.table("country_context", {
  id: uuid("id").primaryKey().defaultRandom(),
  country: text("country").notNull().unique(),
  keyIndustries: jsonb("key_industries"),
  workforceTrends: jsonb("workforce_trends"),
  tradeDemand: jsonb("trade_demand"),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const regionalContext = directoryEngineSchema.table("regional_context", {
  id: uuid("id").primaryKey().defaultRandom(),
  region: text("region").notNull().unique(),
  country: text("country"),
  keyIndustries: jsonb("key_industries"),
  topTrades: jsonb("top_trades"),
  serviceDemand: jsonb("service_demand"),
  populationTraits: jsonb("population_traits"),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const submissions = directoryEngineSchema.table("submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  directoryId: uuid("directory_id")
    .notNull()
    .references(() => directories.id),
  region: text("region"),
  generatedVariants: jsonb("generated_variants"),
  selectedVariant: text("selected_variant"),
  status: text("status").notNull().default("DRAFT"), // DRAFT | READY | SUBMITTED | APPROVED | REJECTED
  listingUrl: text("listing_url"),
  targetUrlOverride: text("target_url_override"),
  submittedAt: timestamp("submitted_at", { mode: "date" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const backlinks = directoryEngineSchema.table("backlinks", {
  id: uuid("id").primaryKey().defaultRandom(),
  directoryId: uuid("directory_id")
    .notNull()
    .references(() => directories.id),
  listingUrl: text("listing_url"),
  verified: boolean("verified").notNull().default(false),
  lastChecked: timestamp("last_checked", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// Outreach (contractor_contacts) - legacy, LGS uses contractor_leads
export const contractorContacts = directoryEngineSchema.table("contractor_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  jobPosition: text("job_position"),
  tradeCategory: text("trade_category"),
  location: text("location"),
  email: text("email").notNull(),
  website: text("website"),
  notes: text("notes"),
  status: text("status").notNull().default("pending"),
  repliedAt: timestamp("replied_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const emailMessages = directoryEngineSchema.table("email_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contractorContacts.id),
  campaignType: text("campaign_type").notNull().default("contractor"),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  hash: text("hash").notNull(),
  approved: boolean("approved").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const emailQueue = directoryEngineSchema.table("email_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => emailMessages.id),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contractorContacts.id),
  senderAccount: text("sender_account"),
  scheduledTime: timestamp("scheduled_time", { mode: "date" }),
  sendStatus: text("send_status").notNull().default("pending"),
  sentAt: timestamp("sent_at", { mode: "date" }),
  attempts: integer("attempts").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at", { mode: "date" }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// LGS: sender_pool (outreach sender rotation)
export const senderPool = directoryEngineSchema.table("sender_pool", {
  id: uuid("id").primaryKey().defaultRandom(),
  senderEmail: text("sender_email").notNull().unique(),
  dailyLimit: integer("daily_limit").notNull().default(50),
  sentToday: integer("sent_today").notNull().default(0),
  lastSentAt: timestamp("last_sent_at", { mode: "date" }),
  status: text("status").notNull().default("active"),
  // Warmup tracking
  // warmup_status: not_started | warming | ready | paused | disabled
  warmupStatus: text("warmup_status").notNull().default("not_started"),
  warmupStartedAt: timestamp("warmup_started_at", { mode: "date" }),
  warmupDay: integer("warmup_day").notNull().default(0),
  warmupEmailsSentToday: integer("warmup_emails_sent_today").notNull().default(0),
  warmupTotalReplies: integer("warmup_total_replies").notNull().default(0),
  warmupTotalSent: integer("warmup_total_sent").notNull().default(0),
  warmupInboxPlacement: text("warmup_inbox_placement").default("unknown"),
  // Rolling 24-hour warmup governance
  currentDayStartedAt: timestamp("current_day_started_at", { mode: "date" }),
  outreachSentToday: integer("outreach_sent_today").notNull().default(0),
  warmupSentToday: integer("warmup_sent_today").notNull().default(0),
  outreachEnabled: boolean("outreach_enabled").notNull().default(false),
  warmupStabilityVerified: boolean("warmup_stability_verified").notNull().default(false),
  warmupStabilityStartedAt: timestamp("warmup_stability_started_at", { mode: "date" }),
  // Safety: cooldown kill-switch (skip sender entirely until this time)
  cooldownUntil: timestamp("cooldown_until", { mode: "date" }),
  // Warmup health score: GOOD / WARNING / RISK (computed by worker)
  healthScore: text("health_score").default("unknown"),
  // Warmup reliability: exact timing & last action
  nextWarmupSendAt: timestamp("next_warmup_send_at", { mode: "date" }),
  lastWarmupSentAt: timestamp("last_warmup_sent_at", { mode: "date" }),
  lastWarmupResult: text("last_warmup_result"),
  lastWarmupRecipient: text("last_warmup_recipient"),
  gmailRefreshToken: text("gmail_refresh_token"),
  gmailAccessToken: text("gmail_access_token"),
  gmailTokenExpiresAt: timestamp("gmail_token_expires_at", { mode: "date" }),
  gmailConnected: boolean("gmail_connected").notNull().default(false),
  warmupIntervalAnchorAt: timestamp("warmup_interval_anchor_at", { mode: "date" }),
  warmupSendingAt: timestamp("warmup_sending_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// LGS: contractor_leads (primary lead CRM)
export const contractorLeads = directoryEngineSchema.table("contractor_leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadNumber: integer("lead_number"),
  leadName: text("lead_name"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  title: text("title"),
  businessName: text("business_name"),
  address: text("address"),
  // Original scraped value preserved for debugging / re-cleaning
  scrapedBusinessName: text("scraped_business_name"),
  email: text("email"),
  website: text("website"),
  phone: text("phone"),
  trade: text("trade"),
  city: text("city"),
  state: text("state"),
  country: text("country"),
  source: text("source"),
  needsEnrichment: boolean("needs_enrichment").notNull().default(false),
  assignmentStatus: text("assignment_status").notNull().default("pending"),
  outreachStatus: text("outreach_status").notNull().default("pending"),
  emailVerificationStatus: text("email_verification_status").notNull().default("pending"),
  verificationAttempts: integer("verification_attempts").notNull().default(0),
  emailVerificationCheckedAt: timestamp("email_verification_checked_at"),
  emailVerificationScore: integer("email_verification_score"),
  emailVerificationProvider: text("email_verification_provider"),
  // email_type: business | free_provider | disposable | unknown
  emailType: text("email_type"),
  status: text("status").notNull().default("new"),
  campaignId: uuid("campaign_id"),
  contactAttempts: integer("contact_attempts").notNull().default(0),
  emailDate: timestamp("email_date", { mode: "date" }),
  emailCopy: text("email_copy"),
  responseReceived: boolean("response_received").notNull().default(false),
  signedUp: boolean("signed_up").notNull().default(false),
  replyCount: integer("reply_count").notNull().default(0),
  leadScore: integer("lead_score").notNull().default(0),
  verificationScore: integer("verification_score").default(0),
  verificationStatus: text("verification_status"),
  verificationSource: text("verification_source"),
  domainReputation: text("domain_reputation"),
  emailBounced: boolean("email_bounced").default(false),
  bounceReason: text("bounce_reason"),
  discoveryMethod: text("discovery_method"),
  leadSource: text("lead_source"),
  notes: text("notes"),
  // Domain-level email consolidation: one lead per domain, best email selected as primary
  secondaryEmails: jsonb("secondary_emails"),
  primaryEmailScore: integer("primary_email_score"),
  // Archiving: low-quality or manually archived leads are hidden from the active pipeline
  archived: boolean("archived").notNull().default(false),
  archivedAt: timestamp("archived_at", { mode: "date" }),
  archiveReason: text("archive_reason"),
  processedReplyIds: jsonb("processed_reply_ids").notNull().default([]),
  // Outreach Brain: lead scoring + lifecycle
  // lead_priority: high | medium | low — auto-computed from lead_score unless priority_source = 'manual'
  leadPriority: text("lead_priority").default("medium"),
  // priority_source: auto | manual — prevents rescore from overwriting operator-set priority
  prioritySource: text("priority_source").default("auto"),
  // score_dirty: true when scoring inputs change; cleared by rescoreDirtyLeads worker cycle
  scoreDirty: boolean("score_dirty").notNull().default(true),
  priorityScore: integer("priority_score").notNull().default(0),
  // outreach_stage: lifecycle state — not_contacted | message_ready | queued | sent | replied | converted | paused | archived
  outreachStage: text("outreach_stage").default("not_contacted"),
  followupCount: integer("followup_count").notNull().default(0),
  lastContactedAt: timestamp("last_contacted_at", { mode: "date" }),
  lastRepliedAt: timestamp("last_replied_at", { mode: "date" }),
  // next_followup_at: scheduling signal for follow-up engine (separate from lifecycle stage)
  nextFollowupAt: timestamp("next_followup_at", { mode: "date" }),
  // last_message_type_sent: shortcut to avoid joining outreach_messages for type decisions
  lastMessageTypeSent: text("last_message_type_sent"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// LGS: job_poster_leads (parallel CRM for job poster targets)
export const jobPosterLeads = directoryEngineSchema.table("job_poster_leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").references(() => leadFinderCampaigns.id, { onDelete: "set null" }),
  website: text("website").notNull(),
  companyName: text("company_name"),
  contactName: text("contact_name"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  title: text("title"),
  email: text("email"),
  phone: text("phone"),
  category: text("category").notNull().default("business"),
  trade: text("trade"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  country: text("country"),
  source: text("source"),
  needsEnrichment: boolean("needs_enrichment").notNull().default(false),
  assignmentStatus: text("assignment_status").notNull().default("pending"),
  outreachStatus: text("outreach_status").notNull().default("pending"),
  emailVerificationStatus: text("email_verification_status").notNull().default("pending"),
  verificationAttempts: integer("verification_attempts").notNull().default(0),
  emailVerificationCheckedAt: timestamp("email_verification_checked_at"),
  emailVerificationScore: integer("email_verification_score"),
  emailVerificationProvider: text("email_verification_provider"),
  status: text("status").notNull().default("new"),
  contactAttempts: integer("contact_attempts").notNull().default(0),
  responseReceived: boolean("response_received").notNull().default(false),
  signedUp: boolean("signed_up").notNull().default(false),
  replyCount: integer("reply_count").notNull().default(0),
  leadScore: integer("lead_score").notNull().default(0),
  emailBounced: boolean("email_bounced").default(false),
  bounceReason: text("bounce_reason"),
  notes: text("notes"),
  archived: boolean("archived").notNull().default(false),
  archivedAt: timestamp("archived_at", { mode: "date" }),
  archiveReason: text("archive_reason"),
  processedReplyIds: jsonb("processed_reply_ids").notNull().default([]),
  leadPriority: text("lead_priority").default("medium"),
  prioritySource: text("priority_source").default("auto"),
  scoreDirty: boolean("score_dirty").notNull().default(true),
  priorityScore: integer("priority_score").notNull().default(0),
  outreachStage: text("outreach_stage").default("not_contacted"),
  followupCount: integer("followup_count").notNull().default(0),
  lastContactedAt: timestamp("last_contacted_at", { mode: "date" }),
  lastRepliedAt: timestamp("last_replied_at", { mode: "date" }),
  nextFollowupAt: timestamp("next_followup_at", { mode: "date" }),
  lastMessageTypeSent: text("last_message_type_sent"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// LGS: outreach_messages (GPT-generated per lead)
export const outreachMessages = directoryEngineSchema.table("outreach_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => contractorLeads.id),
  campaignType: text("campaign_type").notNull().default("contractor"),
  subject: text("subject"),
  body: text("body"),
  replyReceived: boolean("reply_received").notNull().default(false),
  messageHash: text("message_hash"),
  generationContext: jsonb("generation_context"),
  generatedBy: text("generated_by").default("gpt5-nano"),
  status: text("status").default("pending_review"),
  // Message strategy: intro_short | intro_standard | intro_trade_specific | followup_1 | followup_2
  messageType: text("message_type").default("intro_standard"),
  // Fingerprint of strategic context (messageType + trade + city + priority) for performance analysis
  messageVersionHash: text("message_version_hash"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  reviewedAt: timestamp("reviewed_at", { mode: "date" }),
  reviewer: text("reviewer"),
});

// LGS: lgs_outreach_queue (approved messages to send)
export const lgsOutreachQueue = directoryEngineSchema.table("lgs_outreach_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  outreachMessageId: uuid("outreach_message_id")
    .notNull()
    .references(() => outreachMessages.id),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => contractorLeads.id),
  priority: integer("priority").default(5),
  senderAccount: text("sender_account"),
  sendStatus: text("send_status").default("pending"),
  sentAt: timestamp("sent_at", { mode: "date" }),
  attempts: integer("attempts").default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

// LGS: job_poster_email_messages (isolated job poster review/send drafts)
export const jobPosterEmailMessages = directoryEngineSchema.table("job_poster_email_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").references(() => leadFinderCampaigns.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => jobPosterLeads.id),
  subject: text("subject"),
  body: text("body"),
  replyReceived: boolean("reply_received").notNull().default(false),
  messageHash: text("message_hash"),
  generationContext: jsonb("generation_context"),
  generatedBy: text("generated_by").default("gpt5-nano"),
  status: text("status").default("draft"),
  messageType: text("message_type").default("intro_standard"),
  messageVersionHash: text("message_version_hash"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  reviewedAt: timestamp("reviewed_at", { mode: "date" }),
  reviewer: text("reviewer"),
});

// LGS: job_poster_email_queue (isolated job poster queue)
export const jobPosterEmailQueue = directoryEngineSchema.table("job_poster_email_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => jobPosterEmailMessages.id),
  senderEmail: text("sender_email").notNull(),
  scheduledAt: timestamp("scheduled_at", { mode: "date" }),
  sentAt: timestamp("sent_at", { mode: "date" }),
  status: text("status").default("pending"),
  retryCount: integer("retry_count").default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

export const emailVerificationQueue = directoryEngineSchema.table("email_verification_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  normalizedEmail: text("normalized_email").notNull(),
  originalEmail: text("original_email").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  checkedAt: timestamp("checked_at"),
  provider: text("provider"),
  resultStatus: text("result_status"),
  resultScore: integer("result_score"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// LGS: lgs_inbound_events (shared inbound reply/bounce audit log)
export const lgsInboundEvents = directoryEngineSchema.table("lgs_inbound_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull().default("manual"),
  externalEventId: text("external_event_id"),
  campaignType: text("campaign_type").notNull().default("contractor"),
  eventType: text("event_type").notNull(),
  fromEmail: text("from_email").notNull(),
  toEmail: text("to_email").notNull(),
  subject: text("subject"),
  body: text("body"),
  matchedMessageId: uuid("matched_message_id"),
  matchedLeadId: uuid("matched_lead_id"),
  matchedCampaignId: uuid("matched_campaign_id"),
  rawPayload: jsonb("raw_payload"),
  processedAt: timestamp("processed_at", { mode: "date" }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// LGS: discovery_runs (bulk domain search stats)
export const discoveryRuns = directoryEngineSchema.table("discovery_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  domainsTotal: integer("domains_total").default(0),
  domainsProcessed: integer("domains_processed").default(0),
  successfulDomains: integer("successful_domains").default(0),
  // Terminology: emails_found = all extracted before rejection
  emailsFound: integer("emails_found").default(0),
  // qualifiedEmails = passed rejection + score >= 85
  qualifiedEmails: integer("qualified_emails").default(0),
  // insertedLeads = qualified and not duplicate
  insertedLeads: integer("inserted_leads").default(0),
  // duplicatesSkipped = qualified but already in DB
  duplicatesSkipped: integer("duplicates_skipped").default(0),
  // rejectedEmails = failed rejection or quality rules
  rejectedEmails: integer("rejected_emails").default(0),
  domainsDiscarded: integer("domains_discarded").default(0),
  failedDomains: integer("failed_domains").default(0),
  skippedDomains: integer("skipped_domains").default(0),
  emailsScraped: integer("emails_scraped").default(0),
  emailsPatternGenerated: integer("emails_pattern_generated").default(0),
  emailsVerified: integer("emails_verified").default(0),
  emailsImported: integer("emails_imported").default(0),
  contactsFound: integer("contacts_found").default(0),
  campaignType: text("campaign_type").notNull().default("contractor"),
  targetCampaignId: uuid("target_campaign_id"),
  targetCategory: text("target_category"),
  autoImportSource: text("auto_import_source"),
  // Stores { [domain]: { city, state } } from CSV/XLSX import
  importDomainMetadata: jsonb("import_domain_metadata"),
  status: text("status").default("running"),
  // Timing fields — set at processDiscoveryRun start/finish
  startedAt: timestamp("started_at", { mode: "date" }),
  finishedAt: timestamp("finished_at", { mode: "date" }),
  elapsedMs: integer("elapsed_ms"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

// LGS: discovery_domain_logs
export const discoveryDomainLogs = directoryEngineSchema.table("discovery_domain_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").references(() => discoveryRuns.id),
  domain: text("domain"),
  emailsFound: integer("emails_found"),
  status: text("status"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

// LGS: discovery_domain_cache (dedup)
export const discoveryDomainCache = directoryEngineSchema.table("discovery_domain_cache", {
  domain: text("domain").primaryKey(),
  lastDiscoveredAt: timestamp("last_discovered_at", { mode: "date" }).notNull(),
});

// LGS: discovery_run_leads (staging before import; one row per email)
export const discoveryRunLeads = directoryEngineSchema.table("discovery_run_leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id")
    .notNull()
    .references(() => discoveryRuns.id),
  domain: text("domain"),
  email: text("email").notNull(),
  businessName: text("business_name"),
  contactName: text("contact_name"),
  industry: text("industry"),
  verificationScore: integer("verification_score"),
  discoveryMethod: text("discovery_method"),
  campaignType: text("campaign_type").notNull().default("contractor"),
  imported: boolean("imported").default(false),
  // import_status: pending | inserted | skipped_duplicate | skipped_rejected
  importStatus: text("import_status").default("pending"),
  skipReason: text("skip_reason"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

// LGS: region_launches (expansion tracker)
export const regionLaunches = directoryEngineSchema.table("region_launches", {
  id: uuid("id").primaryKey().defaultRandom(),
  region: text("region").notNull(),
  status: text("status").notNull(),
  leads: integer("leads").notNull().default(0),
  contractors: integer("contractors").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// LGS: acquisition_channels (with cost for ROI)
export const acquisitionChannels = directoryEngineSchema.table("acquisition_channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  costCents: integer("cost_cents").default(0),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// Outreach Brain: single-row operator settings table
export const lgsOutreachSettings = directoryEngineSchema.table("lgs_outreach_settings", {
  id: serial("id").primaryKey(),
  // Minimum lead score required to enter the send queue (0 = allow all)
  minLeadScoreToQueue: integer("min_lead_score_to_queue").notNull().default(0),
  // Minimum days between outreach attempts to the same company domain
  domainCooldownDays: integer("domain_cooldown_days").notNull().default(7),
  // Days after initial send before follow-up 1 is generated
  followup1DelayDays: integer("followup1_delay_days").notNull().default(4),
  // Days after follow-up 1 before follow-up 2 is generated
  followup2DelayDays: integer("followup2_delay_days").notNull().default(6),
  // Maximum follow-up messages per lead before auto-pausing
  maxFollowupsPerLead: integer("max_followups_per_lead").notNull().default(2),
  // Automatically generate follow-up messages when delay expires
  autoGenerateFollowups: boolean("auto_generate_followups").notNull().default(true),
  // Follow-up messages require manual approval before sending
  requireFollowupApproval: boolean("require_followup_approval").notNull().default(true),
  // Max total sends to any one company domain in a 30-day window
  maxSendsPerCompany30d: integer("max_sends_per_company_30d").notNull().default(3),
  // Minimum sender health level: good | warning | risk (interpreted via SENDER_HEALTH_ORDER)
  minSenderHealthLevel: text("min_sender_health_level").notNull().default("risk"),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// Warmup activity log — auditable record of every warmup send/fail/skip
export const lgsWarmupActivity = directoryEngineSchema.table("lgs_warmup_activity", {
  id: serial("id").primaryKey(),
  senderEmail: text("sender_email").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  subject: text("subject"),
  messageType: text("message_type"),
  sentAt: timestamp("sent_at", { mode: "date" }).notNull().defaultNow(),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  provider: text("provider"),
  providerMessageId: text("provider_message_id"),
  latencyMs: integer("latency_ms"),
  statusReason: text("status_reason"),
  attemptNumber: integer("attempt_number"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// Worker health tracking — single-row per worker for heartbeat + config checks
export const lgsWorkerHealth = directoryEngineSchema.table("lgs_worker_health", {
  id: serial("id").primaryKey(),
  workerName: text("worker_name").notNull().unique(),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { mode: "date" }),
  lastRunStartedAt: timestamp("last_run_started_at", { mode: "date" }),
  lastRunFinishedAt: timestamp("last_run_finished_at", { mode: "date" }),
  lastRunStatus: text("last_run_status"),
  lastError: text("last_error"),
  configCheckResult: jsonb("config_check_result"),
});

export const warmupSystemState = directoryEngineSchema.table("warmup_system_state", {
  id: serial("id").primaryKey(),
  systemName: text("system_name").notNull().default("default").unique(),
  lastWorkerRunAt: timestamp("last_worker_run_at", { mode: "date" }),
  lastSuccessfulSendAt: timestamp("last_successful_send_at", { mode: "date" }),
  workerStatus: text("worker_status").notNull().default("stale"),
  lastError: text("last_error"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// ─── Lead Finder ─────────────────────────────────────────────────────────────

// LGS: lead_finder_campaigns — city×trade discovery campaign config + metrics
export const leadFinderCampaigns = directoryEngineSchema.table("lead_finder_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  campaignType: text("campaign_type").notNull().default("contractor"),
  state: text("state").notNull().default("CA"),
  // JSON arrays: string[]
  cities: jsonb("cities").notNull().default([]),
  trades: jsonb("trades").notNull().default([]),
  categories: jsonb("categories").notNull().default([]),
  sources: jsonb("sources").notNull().default([]),
  maxResultsPerCombo: integer("max_results_per_combo").notNull().default(25),
  // Geographic radius search — optional; when set, passes locationBias.circle to Google Places
  centerLat: doublePrecision("center_lat"),
  centerLng: doublePrecision("center_lng"),
  radiusKm: integer("radius_km").default(25),
  // Safety caps
  maxDomainsTotal: integer("max_domains_total").notNull().default(10000),
  maxRuntimeMinutes: integer("max_runtime_minutes").notNull().default(30),
  maxApiCalls: integer("max_api_calls").default(500),
  // Counters
  jobsTotal: integer("jobs_total").notNull().default(0),
  jobsComplete: integer("jobs_complete").notNull().default(0),
  domainsFound: integer("domains_found").notNull().default(0),
  uniqueDomains: integer("unique_domains").notNull().default(0),
  domainsSent: integer("domains_sent").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  replyCount: integer("reply_count").notNull().default(0),
  bounceCount: integer("bounce_count").notNull().default(0),
  // Timing + performance
  startedAt: timestamp("started_at", { mode: "date" }),
  finishedAt: timestamp("finished_at", { mode: "date" }),
  elapsedSeconds: integer("elapsed_seconds"),
  domainsPerSecond: text("domains_per_second"), // stored as decimal string
  // status: draft | running | cancel_requested | cancelled | complete | failed
  status: text("status").notNull().default("draft"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// LGS: lead_finder_jobs — one per city×trade×source combination
export const leadFinderJobs = directoryEngineSchema.table("lead_finder_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => leadFinderCampaigns.id),
  city: text("city").notNull(),
  state: text("state").notNull(),
  trade: text("trade"),
  category: text("category"),
  source: text("source").notNull(), // google_maps | google_search | yelp | directories
  // status: pending | running | complete | failed | skipped
  status: text("status").notNull().default("pending"),
  domainsFound: integer("domains_found").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// LGS: lead_finder_domains — staging table for discovered contractor domains
export const leadFinderDomains = directoryEngineSchema.table("lead_finder_domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => leadFinderCampaigns.id),
  jobId: uuid("job_id").references(() => leadFinderJobs.id),
  domain: text("domain"),
  businessName: text("business_name"),
  campaignType: text("campaign_type").notNull().default("contractor"),
  trade: text("trade"),
  category: text("category"),
  city: text("city"),
  state: text("state"),
  source: text("source"), // google_maps | google_search | yelp | directories
  websiteUrl: text("website_url"),
  formattedAddress: text("formatted_address"),
  phone: text("phone"),
  placeId: text("place_id"),
  replyRate: doublePrecision("reply_rate").notNull().default(0),
  sentToDiscovery: boolean("sent_to_discovery").notNull().default(false),
  discoveryRunId: uuid("discovery_run_id"), // set when sent to domain discovery pipeline
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
