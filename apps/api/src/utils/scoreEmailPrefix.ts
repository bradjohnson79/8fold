/**
 * Email prefix scoring for LGS outreach prioritization.
 *
 * Purpose: When multiple emails are discovered for the same company domain,
 * score each one so the best outreach email can be selected as primary.
 *
 * Score hierarchy:
 *   100 — Personal name prefix (john@, sarah@, mike@)
 *    80 — Direct business contact (sales@, projects@, contracts@)
 *    60 — General company inbox (info@, contact@, office@)
 *    40 — Low-priority / support inboxes (support@, admin@, hello@)
 *    -1 — Rejected (automated / spam traps — never use for outreach)
 */

/** Prefixes that are automated / spam traps — hard reject */
const REJECT_PATTERNS = [
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "bounce",
  "mailer-daemon",
  "postmaster",
  "test",
  "example",
  "sentry",
  "alerts",
  "notifications",
  "daemon",
  "robot",
  "spam",
  "abuse",
];

/** Score 80: direct business contact prefixes */
const BUSINESS_CONTACT_PREFIXES = new Set([
  "sales",
  "service",
  "services",
  "projects",
  "contracts",
  "estimating",
  "estimates",
  "bids",
  "bidding",
  "work",
  "jobs",
  "hiring",
  "newclients",
  "newbusiness",
  "booking",
  "bookings",
  "schedule",
  "scheduling",
]);

/** Score 60: general company inbox prefixes */
const GENERAL_PREFIXES = new Set([
  "info",
  "information",
  "contact",
  "contactus",
  "office",
  "mail",
  "email",
  "general",
  "inquiry",
  "inquiries",
  "questions",
  "hello",
  "hey",
  "hi",
  "team",
  "us",
  "company",
]);

/** Score 40: low-priority support / admin prefixes */
const LOW_PRIORITY_PREFIXES = new Set([
  "support",
  "admin",
  "administrator",
  "helpdesk",
  "help",
  "customerservice",
  "customercare",
  "cs",
  "care",
  "feedback",
  "webmaster",
  "it",
  "ops",
  "operations",
  "reception",
  "front",
  "frontdesk",
  "billing",
  "accounts",
  "accounting",
  "invoice",
  "invoices",
  "orders",
  "order",
]);

/**
 * Common non-name words that appear in email prefixes but are NOT personal names.
 * Used to distinguish personal-name prefixes (score 100) from generic ones.
 */
const GENERIC_WORDS = new Set([
  ...BUSINESS_CONTACT_PREFIXES,
  ...GENERAL_PREFIXES,
  ...LOW_PRIORITY_PREFIXES,
  "staff",
  "crew",
  "media",
  "press",
  "pr",
  "marketing",
  "connect",
]);

/**
 * Returns the priority score for an email address.
 *
 * -1  = rejected (do not use for outreach)
 * 40  = low priority
 * 60  = general company inbox
 * 80  = direct business contact
 * 100 = personal name (highest priority)
 */
export function scoreEmailPrefix(email: string): number {
  const lower = email.toLowerCase().trim();
  const prefix = lower.split("@")[0] ?? "";

  // Hard reject check
  for (const pattern of REJECT_PATTERNS) {
    if (prefix.includes(pattern)) return -1;
  }

  if (BUSINESS_CONTACT_PREFIXES.has(prefix)) return 80;
  if (GENERAL_PREFIXES.has(prefix)) return 60;
  if (LOW_PRIORITY_PREFIXES.has(prefix)) return 40;

  // Heuristic: looks like a personal name prefix
  // Criteria: 3–20 alpha chars only, not a known generic word
  if (/^[a-z]{3,20}$/.test(prefix) && !GENERIC_WORDS.has(prefix)) {
    return 100;
  }

  // Names with dots like "john.smith" or hyphens like "j-smith"
  if (/^[a-z]+[.\-][a-z]+$/.test(prefix)) {
    return 100;
  }

  // Alphanumeric with dots/underscores — treat as moderate
  return 40;
}

/**
 * Returns true if the email should be rejected entirely and never used for outreach
 * (not even stored as secondary).
 */
export function shouldRejectEmailForOutreach(email: string): boolean {
  return scoreEmailPrefix(email) === -1;
}

/**
 * Given an array of emails for a single domain, returns them sorted by priority score
 * (highest first), with rejected emails filtered out.
 */
export function rankEmailsForDomain(emails: string[]): Array<{ email: string; score: number }> {
  return emails
    .map((e) => ({ email: e, score: scoreEmailPrefix(e) }))
    .filter((e) => e.score !== -1)
    .sort((a, b) => b.score - a.score);
}
