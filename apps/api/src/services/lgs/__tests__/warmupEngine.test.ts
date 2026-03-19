import { describe, it, expect } from "vitest";
import {
  getExternalRatio,
  pickWarmupTarget,
  computeHealthScore,
  INTERNAL_SENDERS,
  EXTERNAL_TARGETS,
} from "../warmupEngine";
import { getDailyLimit, isReadyForOutreach } from "../warmupSchedule";

describe("getExternalRatio", () => {
  it("returns 0.3 for day 1", () => expect(getExternalRatio(1)).toBe(0.3));
  it("returns 0.3 for day 2", () => expect(getExternalRatio(2)).toBe(0.3));
  it("returns 0.5 for day 3", () => expect(getExternalRatio(3)).toBe(0.5));
  it("returns 0.5 for day 4", () => expect(getExternalRatio(4)).toBe(0.5));
  it("returns 0.6 for day 5+", () => expect(getExternalRatio(8)).toBe(0.6));
});

describe("pickWarmupTarget", () => {
  it("never returns self as target", () => {
    for (let i = 0; i < 50; i += 1) {
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
      expect(EXTERNAL_TARGETS.map((email) => email.toLowerCase())).toContain(result.target.toLowerCase());
    }
  });

  it("avoids back-to-back same recipient when alternatives exist", () => {
    let sameCount = 0;
    for (let i = 0; i < 50; i += 1) {
      const result = pickWarmupTarget("info@8fold.app", "hello@8fold.app", 1, 0.99);
      if (result.target?.toLowerCase() === "hello@8fold.app") {
        sameCount += 1;
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
});

describe("getDailyLimit", () => {
  it("returns the correct ramp limits", () => {
    expect(getDailyLimit(1)).toBe(5);
    expect(getDailyLimit(2)).toBe(10);
    expect(getDailyLimit(3)).toBe(20);
    expect(getDailyLimit(4)).toBe(35);
    expect(getDailyLimit(5)).toBe(50);
    expect(getDailyLimit(8)).toBe(50);
  });
});

describe("isReadyForOutreach", () => {
  it("requires day 5 and 50/day", () => {
    expect(isReadyForOutreach(5, 50)).toBe(true);
    expect(isReadyForOutreach(4, 50)).toBe(false);
    expect(isReadyForOutreach(5, 35)).toBe(false);
  });
});

describe("computeHealthScore", () => {
  it("returns risk when sender is in cooldown", () => {
    expect(
      computeHealthScore({
        warmupTotalSent: 100,
        warmupTotalReplies: 50,
        warmupInboxPlacement: "excellent",
        cooldownUntil: new Date(Date.now() + 60_000),
      }),
    ).toBe("risk");
  });

  it("returns unknown when fewer than 5 sends", () => {
    expect(
      computeHealthScore({
        warmupTotalSent: 3,
        warmupTotalReplies: 1,
        warmupInboxPlacement: "good",
        cooldownUntil: null,
      }),
    ).toBe("unknown");
  });

  it("scores good/warning/risk based on replies and inbox placement", () => {
    expect(
      computeHealthScore({
        warmupTotalSent: 100,
        warmupTotalReplies: 50,
        warmupInboxPlacement: "excellent",
        cooldownUntil: null,
      }),
    ).toBe("good");

    expect(
      computeHealthScore({
        warmupTotalSent: 100,
        warmupTotalReplies: 10,
        warmupInboxPlacement: "fair",
        cooldownUntil: null,
      }),
    ).toBe("warning");

    expect(
      computeHealthScore({
        warmupTotalSent: 100,
        warmupTotalReplies: 0,
        warmupInboxPlacement: "poor",
        cooldownUntil: null,
      }),
    ).toBe("risk");
  });
});
