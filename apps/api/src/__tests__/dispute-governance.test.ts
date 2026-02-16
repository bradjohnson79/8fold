import { describe, expect, test } from "vitest";
import { computeDisputeVoteCounts, type VoteRow } from "../support/disputeVoteCounts";
import { isJobDisputedForRelease } from "../utils/jobReleaseEligible";

describe("dispute governance", () => {
  describe("vote counting", () => {
    test("2 human POSTER + 1 AI CONTRACTOR → majority POSTER", () => {
      const votes: VoteRow[] = [
        { voterType: "ADMIN", voterUserId: "u1", status: "ACTIVE", vote: "POSTER", createdAt: new Date("2025-01-01") },
        { voterType: "ADMIN", voterUserId: "u2", status: "ACTIVE", vote: "POSTER", createdAt: new Date("2025-01-02") },
        { voterType: "AI_ADVISORY", voterUserId: null, status: "ACTIVE", vote: "CONTRACTOR", createdAt: new Date("2025-01-03") },
      ];
      const r = computeDisputeVoteCounts(votes);
      expect(r.humanCount).toBe(2);
      expect(r.top).toEqual(["POSTER", 2]);
      expect(r.second).toEqual(["CONTRACTOR", 1]);
      expect(r.hasMajority).toBe(true);
      expect(r.isTie).toBe(false);
    });

    test("AI regeneration: only latest ACTIVE AI counted, majority POSTER", () => {
      const votes: VoteRow[] = [
        { voterType: "ADMIN", voterUserId: "u1", status: "ACTIVE", vote: "POSTER", createdAt: new Date("2025-01-01") },
        { voterType: "ADMIN", voterUserId: "u2", status: "ACTIVE", vote: "POSTER", createdAt: new Date("2025-01-02") },
        { voterType: "AI_ADVISORY", voterUserId: null, status: "SUPERSEDED", vote: "CONTRACTOR", createdAt: new Date("2025-01-03") },
        { voterType: "AI_ADVISORY", voterUserId: null, status: "ACTIVE", vote: "POSTER", createdAt: new Date("2025-01-04") },
      ];
      const r = computeDisputeVoteCounts(votes);
      expect(r.humanCount).toBe(2);
      expect(r.top).toEqual(["POSTER", 3]);
      expect(r.second).toBeNull();
      expect(r.hasMajority).toBe(true);
      expect(r.isTie).toBe(false);
    });
  });

  describe("freeze", () => {
    test("DISPUTED job blocks release", () => {
      expect(isJobDisputedForRelease({ status: "DISPUTED" })).toBe(true);
      expect(isJobDisputedForRelease({ status: "IN_PROGRESS" })).toBe(false);
      expect(isJobDisputedForRelease({ status: null })).toBe(false);
      expect(isJobDisputedForRelease({})).toBe(false);
    });
  });
});
