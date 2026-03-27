import { describe, expect, test } from "vitest";
import {
  getNextBusinessWindow,
  getPacificDateKey,
  isBusinessWindowOpen,
  nextPreferredType,
  normalizeState,
} from "../outreachDispatchService";

describe("outreachDispatchService scheduler helpers", () => {
  test("allows business-hour sending on weekday inside PT window", () => {
    const insideWindowUtc = new Date("2026-03-24T16:30:00.000Z"); // Tue 09:30 PT
    expect(isBusinessWindowOpen(insideWindowUtc)).toBe(true);
  });

  test("blocks sending outside weekday business window", () => {
    const beforeWindowUtc = new Date("2026-03-24T15:29:00.000Z"); // Tue 08:29 PT
    const weekendUtc = new Date("2026-03-22T19:00:00.000Z"); // Sun 12:00 PT
    expect(isBusinessWindowOpen(beforeWindowUtc)).toBe(false);
    expect(isBusinessWindowOpen(weekendUtc)).toBe(false);
  });

  test("computes next business window in Pacific time", () => {
    const afterHoursUtc = new Date("2026-03-28T02:00:00.000Z"); // Fri 19:00 PT
    const nextWindow = getNextBusinessWindow(afterHoursUtc);
    expect(getPacificDateKey(nextWindow)).toBe("2026-03-30");
    expect(isBusinessWindowOpen(nextWindow)).toBe(true);
  });

  test("resets scheduler counters when PT date changes", () => {
    const normalized = normalizeState(
      {
        ptDateKey: "2026-03-23",
        contractorSentToday: 12,
        jobPosterSentToday: 8,
        lastEmailTypeSent: "contractor",
        nextEligibleAt: "2026-03-23T18:00:00.000Z",
      },
      "2026-03-24",
    );
    expect(normalized.contractorSentToday).toBe(0);
    expect(normalized.jobPosterSentToday).toBe(0);
    expect(normalized.lastEmailTypeSent).toBeNull();
  });

  test("alternates between contractor and job poster until quotas are reached", () => {
    expect(nextPreferredType(normalizeState({}, "2026-03-24"))).toBe("contractor");
    expect(nextPreferredType(normalizeState({ ptDateKey: "2026-03-24", lastEmailTypeSent: "contractor" }, "2026-03-24"))).toBe("job_poster");
    expect(
      nextPreferredType(
        normalizeState(
          { ptDateKey: "2026-03-24", contractorSentToday: 100, jobPosterSentToday: 25, lastEmailTypeSent: "contractor" },
          "2026-03-24",
        ),
      ),
    ).toBe("job_poster");
  });
});
