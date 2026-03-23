import type EmailValidator from "email-deep-validator";

export const VERIFY_CONCURRENCY = 8;
export const MAX_VERIFICATION_ATTEMPTS = 4;
export const PENDING_24H_WINDOW_HOURS = 24;

export type VerificationStatus = "pending" | "valid" | "invalid";

export type VerificationResult = {
  score: number;
  status: VerificationStatus;
  source: string;
  attempt: number;
  cached: boolean;
};

type DomainCachedResult = Pick<VerificationResult, "score" | "status">;

const FAST_FAIL_LOCAL_PARTS = [
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "mailer-daemon",
  "postmaster",
  "bounce",
  "example",
];

const GARBAGE_SUFFIXES = [".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp"];

export function normalizeVerificationStatus(value: string | null | undefined): VerificationStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "valid" || normalized === "verified" || normalized === "qualified") {
    return "valid";
  }
  if (
    normalized === "invalid" ||
    normalized === "blocked" ||
    normalized === "rejected" ||
    normalized === "low_quality"
  ) {
    return "invalid";
  }
  return "pending";
}

export function normalizeEmail(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}

export function isObviouslyInvalidEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes("@")) return true;
  if (normalized.includes(" ")) return true;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return true;

  const [local = "", domain = ""] = normalized.split("@");
  if (!local || !domain) return true;
  if (FAST_FAIL_LOCAL_PARTS.some((part) => local.includes(part))) return true;
  if (domain === "example.com" || domain === "test.com" || domain === "domain.com") return true;
  if (GARBAGE_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return true;

  return false;
}

export function extractEmailDomain(email: string | null | undefined): string {
  return normalizeEmail(email).split("@")[1] ?? "";
}

export function parseVerificationAttemptCount(source: string | null | undefined): number {
  const match = String(source ?? "").match(/attempt[:=](\d+)/i);
  return match ? Number(match[1] ?? 0) : 0;
}

export function canRetryVerification(source: string | null | undefined): boolean {
  return parseVerificationAttemptCount(source) < MAX_VERIFICATION_ATTEMPTS;
}

export function buildVerificationSource(channel: string, attempt: number, tag: string): string {
  return `${channel};attempt=${attempt};tag=${tag}`;
}

export async function verifyLeadEmail(params: {
  email: string;
  previousSource?: string | null;
  validator: EmailValidator;
  channel: string;
  domainCache?: Map<string, DomainCachedResult>;
}): Promise<VerificationResult> {
  const normalized = normalizeEmail(params.email);
  const attempt = parseVerificationAttemptCount(params.previousSource) + 1;
  const domain = extractEmailDomain(normalized);

  if (isObviouslyInvalidEmail(normalized)) {
    return {
      score: 0,
      status: "invalid",
      source: buildVerificationSource(params.channel, attempt, "fast_fail"),
      attempt,
      cached: false,
    };
  }

  const cached = domain ? params.domainCache?.get(domain) : undefined;
  if (cached && cached.status !== "valid") {
    return {
      ...cached,
      source: buildVerificationSource(params.channel, attempt, `domain_cache_${cached.status}`),
      attempt,
      cached: true,
    };
  }

  try {
    const result = await params.validator.verify(normalized);

    if (!result.wellFormed || !result.validDomain || result.validMailbox === false) {
      const invalidResult: DomainCachedResult = { score: 0, status: "invalid" };
      if (domain) params.domainCache?.set(domain, invalidResult);
      return {
        ...invalidResult,
        source: buildVerificationSource(params.channel, attempt, "validator_invalid"),
        attempt,
        cached: false,
      };
    }

    if (result.validMailbox === true) {
      return {
        score: 100,
        status: "valid",
        source: buildVerificationSource(params.channel, attempt, "validator_valid"),
        attempt,
        cached: false,
      };
    }

    const pendingResult: DomainCachedResult = { score: 50, status: "pending" };
    if (domain) params.domainCache?.set(domain, pendingResult);
    return {
      ...pendingResult,
      source: buildVerificationSource(params.channel, attempt, "validator_pending"),
      attempt,
      cached: false,
    };
  } catch {
    const pendingResult: DomainCachedResult = { score: 25, status: "pending" };
    if (domain) params.domainCache?.set(domain, pendingResult);
    return {
      ...pendingResult,
      source: buildVerificationSource(params.channel, attempt, "validator_error"),
      attempt,
      cached: false,
    };
  }
}
