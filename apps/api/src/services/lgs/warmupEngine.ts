/**
 * Pure warmup engine functions — no DB imports.
 * Designed for deterministic unit testing and reuse by the worker.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const SLOT_TOLERANCE = 0.05;
export const JITTER_FRACTION = 0.025;
export const DAY_MS = 24 * 60 * 60 * 1000;

export const INTERNAL_SENDERS = [
  "info@8fold.app",
  "hello@8fold.app",
  "partners@8fold.app",
  "support@8fold.app",
];

export const EXTERNAL_TARGETS = [
  "bradjohnson79@gmail.com",
  "info@anoint.me",
  "info@aetherx.co",
  "brad@aetherx.co",
  "adronis@aetherx.co",
  "academy@aetherx.co",
  "testimonials@aetherx.co",
  "info@magiapp.dev",
];

// ─── Send Eligibility ─────────────────────────────────────────────────────────

export type EligibilityInput = {
  currentDayStartedAt: Date | null;
  warmupSentToday: number;
  warmupBudget: number;
};

export type EligibilityResult = {
  allowed: boolean;
  dayProgress: number;
  expectedProgress: number;
  nextEligibleMs: number;
  nextSendAt: Date | null;
};

export function checkSendEligibility(input: EligibilityInput): EligibilityResult {
  const { currentDayStartedAt, warmupSentToday, warmupBudget } = input;

  if (!currentDayStartedAt || warmupBudget <= 0) {
    return { allowed: false, dayProgress: 0, expectedProgress: 0, nextEligibleMs: 0, nextSendAt: null };
  }

  const dayStartMs = new Date(currentDayStartedAt).getTime();
  const elapsed = Date.now() - dayStartMs;
  const dayProgress = Math.min(1, elapsed / DAY_MS);

  const nextSlotIndex = warmupSentToday;
  const slotCenter = (nextSlotIndex + 0.5) / warmupBudget;

  // Deterministic per-slot jitter stable across worker cycles
  const jitterSeed = (nextSlotIndex * 2654435761) % 1000;
  const jitter = ((jitterSeed / 1000) - 0.5) * 2 * JITTER_FRACTION;
  const expectedProgress = Math.max(0, Math.min(1, slotCenter + jitter));

  const allowed = dayProgress >= expectedProgress - SLOT_TOLERANCE;

  const openAtFraction = Math.max(0, expectedProgress - SLOT_TOLERANCE);
  const openAtMs = dayStartMs + openAtFraction * DAY_MS;
  const nextEligibleMs = Math.max(0, openAtMs - Date.now());
  const nextSendAt = new Date(openAtMs);

  return { allowed, dayProgress, expectedProgress, nextEligibleMs, nextSendAt };
}

// ─── External Routing ─────────────────────────────────────────────────────────

export function getExternalRatio(day: number): number {
  if (day <= 2) return 0.3;
  if (day <= 4) return 0.5;
  return 0.6;
}

export type WarmupTargetResult = {
  target: string;
  isExternal: boolean;
} | {
  target: null;
  reason: string;
};

export function pickWarmupTarget(
  senderEmail: string,
  lastRecipient: string | null,
  day: number,
  randomValue?: number,
): WarmupTargetResult {
  const rand = randomValue ?? Math.random();
  const externalRatio = getExternalRatio(day);
  const preferExternal = rand < externalRatio;

  const internalCandidates = INTERNAL_SENDERS.filter(
    (e) => e.toLowerCase() !== senderEmail.toLowerCase()
  );

  const pickFrom = (pool: string[], isExternal: boolean): WarmupTargetResult => {
    if (pool.length === 0) return { target: null, reason: "empty_pool" };

    // Avoid back-to-back same recipient when alternatives exist
    if (lastRecipient && pool.length > 1) {
      const filtered = pool.filter((e) => e.toLowerCase() !== lastRecipient.toLowerCase());
      if (filtered.length > 0) {
        return { target: filtered[Math.floor(rand * 1000) % filtered.length]!, isExternal };
      }
    }

    return { target: pool[Math.floor(rand * 1000) % pool.length]!, isExternal };
  };

  if (preferExternal && EXTERNAL_TARGETS.length > 0) {
    const result = pickFrom(EXTERNAL_TARGETS, true);
    if (result.target) return result;
  }

  if (internalCandidates.length > 0) {
    const result = pickFrom(internalCandidates, false);
    if (result.target) return result;
  }

  // Fallback to external if internal empty
  if (EXTERNAL_TARGETS.length > 0) {
    return pickFrom(EXTERNAL_TARGETS, true);
  }

  return { target: null, reason: "no_valid_targets" };
}

// ─── Health Score ─────────────────────────────────────────────────────────────

export type HealthInput = {
  warmupTotalSent: number;
  warmupTotalReplies: number;
  warmupInboxPlacement: string | null;
  cooldownUntil: Date | null;
};

export function computeHealthScore(sender: HealthInput): string {
  if (sender.cooldownUntil && new Date(sender.cooldownUntil) > new Date()) {
    return "risk";
  }

  const totalSent = sender.warmupTotalSent ?? 0;
  if (totalSent < 5) return "unknown";

  const replyRate = totalSent > 0
    ? (sender.warmupTotalReplies ?? 0) / totalSent
    : 0;

  const placement = (sender.warmupInboxPlacement ?? "unknown").toLowerCase();
  const placementScore =
    placement === "excellent" ? 1.0
    : placement === "good" ? 0.75
    : placement === "fair" ? 0.4
    : placement === "poor" ? 0.1
    : 0.5;

  const score = (replyRate * 0.6) + (placementScore * 0.4);

  if (score >= 0.35) return "good";
  if (score >= 0.15) return "warning";
  return "risk";
}
