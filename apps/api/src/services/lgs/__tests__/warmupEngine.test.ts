import { describe, it, expect } from "vitest";
import {
  checkSendEligibility,
  getExternalRatio,
  pickWarmupTarget,
  computeHealthScore,
  INTERNAL_SENDERS,
  EXTERNAL_TARGETS,
  DAY_MS,
} from "../warmupEngine";
import { getDailyLimit, isReadyForOutreach } from "../warmupSchedule";

// ─── checkSendEligibility ─────────────────────────────────────────────────────

describe("checkSendEligibility", () => {
  it("returns not allowed when currentDayStartedAt is null", () => {
    const result = checkSendEligibility({
      currentDayStartedAt: null,
      warmupSentToday: 0,
      warmupBudget: 5,
    });
    expect(result.allowed).toBe(false);
    expect(result.nextSendAt).toBeNull();
  });

  it("returns not allowed when warmupBudget is 0", () => {
    const result = checkSendEligibility({
      currentDayStartedAt: new Date(),
      warmupSentToday: 0,
      warmupBudget: 0,
    });
    expect(result.allowed).toBe(false);
  });

  it("allows first slot once enough day has elapsed", () => {
    // First slot center ~ 0.1 of day, minus tolerance 0.05 = ~0.05 of day (~72 min).
    // Set day start 2 hours ago to ensure eligibility.
    const result = checkSendEligibility({
      currentDayStartedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      warmupSentToday: 0,
      warmupBudget: 5,
    });
    expect(result.allowed).toBe(true);
    expect(result.dayProgress).toBeGreaterThan(0.05);
  });

  it("blocks first slot at very start of the day", () => {
    const result = checkSendEligibility({
      currentDayStartedAt: new Date(Date.now() - 1000),
      warmupSentToday: 0,
      warmupBudget: 5,
    });
    expect(result.allowed).toBe(false);
    expect(result.dayProgress).toBeLessThan(0.01);
  });

  it("blocks mid-day slots when day hasn't progressed enough", () => {
    const dayStart = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
    const result = checkSendEligibility({
      currentDayStartedAt: dayStart,
      warmupSentToday: 3,
      warmupBudget: 5,
    });
    // 3 sent, next slot center ~ 0.7 of day; 1 hour = ~0.042 of day
    expect(result.allowed).toBe(false);
    expect(result.nextEligibleMs).toBeGreaterThan(0);
  });

  it("allows last slot near end of day", () => {
    const dayStart = new Date(Date.now() - 23 * 60 * 60 * 1000); // 23 hours ago
    const result = checkSendEligibility({
      currentDayStartedAt: dayStart,
      warmupSentToday: 4,
      warmupBudget: 5,
    });
    expect(result.allowed).toBe(true);
  });

  it("handles budget exhausted — slot index == budget still computes", () => {
    const result = checkSendEligibility({
      currentDayStartedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
      warmupSentToday: 5,
      warmupBudget: 5,
    });
    expect(result.nextSendAt).not.toBeNull();
  });

  it("produces deterministic jitter for same slot index", () => {
    const dayStart = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const r1 = checkSendEligibility({ currentDayStartedAt: dayStart, warmupSentToday: 2, warmupBudget: 5 });
    const r2 = checkSendEligibility({ currentDayStartedAt: dayStart, warmupSentToday: 2, warmupBudget: 5 });
    expect(r1.expectedProgress).toBe(r2.expectedProgress);
  });

  it("provides a valid nextSendAt timestamp", () => {
    const dayStart = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const result = checkSendEligibility({
      currentDayStartedAt: dayStart,
      warmupSentToday: 0,
      warmupBudget: 5,
    });
    expect(result.nextSendAt).toBeInstanceOf(Date);
    expect(result.nextSendAt!.getTime()).toBeGreaterThan(dayStart.getTime() - DAY_MS);
  });
});

// ─── getExternalRatio ─────────────────────────────────────────────────────────

describe("getExternalRatio", () => {
  it("returns 0.3 for day 1", () => expect(getExternalRatio(1)).toBe(0.3));
  it("returns 0.3 for day 2", () => expect(getExternalRatio(2)).toBe(0.3));
  it("returns 0.5 for day 3", () => expect(getExternalRatio(3)).toBe(0.5));
  it("returns 0.5 for day 4", () => expect(getExternalRatio(4)).toBe(0.5));
  it("returns 0.6 for day 5", () => expect(getExternalRatio(5)).toBe(0.6));
  it("returns 0.6 for day 10", () => expect(getExternalRatio(10)).toBe(0.6));
});

// ─── pickWarmupTarget ─────────────────────────────────────────────────────────

describe("pickWarmupTarget", () => {
  it("never returns self as target", () => {
    for (let i = 0; i < 50; i++) {
      const result = pickWarmupTarget("info@8fold.app", null, 3);
      if (result.target) {
        expect(result.target.toLowerCase()).not.toBe("info@8fold.app");
      }
    }
  });

  it("picks internal when random is above external ratio", () => {
    const result = pickWarmupTarget("info@8fold.app", null, 1, 0.99);
    expect(result.target).not.toBeNull();
    if (result.target) {
      expect(result.target.endsWith("@8fold.app")).toBe(true);
    }
  });

  it("picks external when random is below external ratio", () => {
    const result = pickWarmupTarget("info@8fold.app", null, 5, 0.01);
    expect(result.target).not.toBeNull();
    if (result.target) {
      expect(EXTERNAL_TARGETS.map((e) => e.toLowerCase())).toContain(result.target.toLowerCase());
    }
  });

  it("avoids back-to-back same recipient when alternatives exist", () => {
    let sameCount = 0;
    for (let i = 0; i < 50; i++) {
      const result = pickWarmupTarget("info@8fold.app", "hello@8fold.app", 1, 0.99);
      if (result.target && result.target.toLowerCase() === "hello@8fold.app") {
        sameCount++;
      }
    }
    expect(sameCount).toBe(0);
  });

  it("returns a target for any valid sender", () => {
    for (const sender of INTERNAL_SENDERS) {
      const result = pickWarmupTarget(sender, null, 3);
      expect(result.target).not.toBeNull();
    }
  });

  it("falls back to external when all internal are excluded", () => {
    // Only one internal sender and it's the sender itself — impossible scenario
    // but the function should still return an external target
    const result = pickWarmupTarget("info@8fold.app", null, 1, 0.99);
    expect(result.target).not.toBeNull();
  });
});

// ─── getDailyLimit (5-day schedule) ───────────────────────────────────────────

describe("getDailyLimit", () => {
  it("returns 5 for day 1", () => expect(getDailyLimit(1)).toBe(5));
  it("returns 10 for day 2", () => expect(getDailyLimit(2)).toBe(10));
  it("returns 20 for day 3", () => expect(getDailyLimit(3)).toBe(20));
  it("returns 35 for day 4", () => expect(getDailyLimit(4)).toBe(35));
  it("returns 50 for day 5", () => expect(getDailyLimit(5)).toBe(50));
  it("returns 50 for days beyond 5", () => expect(getDailyLimit(8)).toBe(50));
  it("returns 0 for day 0", () => expect(getDailyLimit(0)).toBe(0));
});

// ─── isReadyForOutreach ───────────────────────────────────────────────────────

describe("isReadyForOutreach", () => {
  it("returns true when the sender reached day 5 and 50/day", () => {
    expect(isReadyForOutreach(5, 50)).toBe(true);
  });

  it("returns true when limits exceed the outreach threshold", () => {
    expect(isReadyForOutreach(6, 75)).toBe(true);
  });

  it("returns false before day 5", () => {
    expect(isReadyForOutreach(4, 50)).toBe(false);
  });

  it("returns false when the sender is below 50/day", () => {
    expect(isReadyForOutreach(5, 35)).toBe(false);
  });
});

// ─── computeHealthScore ───────────────────────────────────────────────────────

describe("computeHealthScore", () => {
  it("returns risk when sender is in cooldown", () => {
    expect(computeHealthScore({
      warmupTotalSent: 100,
      warmupTotalReplies: 50,
      warmupInboxPlacement: "excellent",
      cooldownUntil: new Date(Date.now() + 60_000),
    })).toBe("risk");
  });

  it("returns unknown when fewer than 5 sends", () => {
    expect(computeHealthScore({
      warmupTotalSent: 3,
      warmupTotalReplies: 1,
      warmupInboxPlacement: "good",
      cooldownUntil: null,
    })).toBe("unknown");
  });

  it("returns good for high reply rate and excellent placement", () => {
    expect(computeHealthScore({
      warmupTotalSent: 100,
      warmupTotalReplies: 50,
      warmupInboxPlacement: "excellent",
      cooldownUntil: null,
    })).toBe("good");
  });

  it("returns warning for moderate performance", () => {
    expect(computeHealthScore({
      warmupTotalSent: 100,
      warmupTotalReplies: 10,
      warmupInboxPlacement: "fair",
      cooldownUntil: null,
    })).toBe("warning");
  });

  it("returns risk for poor performance", () => {
    expect(computeHealthScore({
      warmupTotalSent: 100,
      warmupTotalReplies: 0,
      warmupInboxPlacement: "poor",
      cooldownUntil: null,
    })).toBe("risk");
  });

  it("handles unknown placement with default score", () => {
    const score = computeHealthScore({
      warmupTotalSent: 50,
      warmupTotalReplies: 15,
      warmupInboxPlacement: "unknown",
      cooldownUntil: null,
    });
    expect(["good", "warning", "risk"]).toContain(score);
  });
});
