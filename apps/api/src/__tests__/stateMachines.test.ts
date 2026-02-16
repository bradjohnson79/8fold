import { describe, expect, test } from "vitest";
import {
  assertAllowedTransition,
  JobAllowedTransitions,
  JobDraftAllowedTransitions,
  PayoutRequestAllowedTransitions
} from "@8fold/shared";

describe("state machines", () => {
  test("JobDraft allows DRAFT -> IN_REVIEW", () => {
    expect(() =>
      assertAllowedTransition("JobDraft", "DRAFT", "IN_REVIEW", JobDraftAllowedTransitions)
    ).not.toThrow();
  });

  test("JobDraft forbids APPROVED -> IN_REVIEW", () => {
    expect(() =>
      assertAllowedTransition("JobDraft", "APPROVED", "IN_REVIEW", JobDraftAllowedTransitions)
    ).toThrow();
  });

  test("Job allows IN_PROGRESS -> CONTRACTOR_COMPLETED", () => {
    expect(() =>
      assertAllowedTransition("Job", "IN_PROGRESS", "CONTRACTOR_COMPLETED", JobAllowedTransitions)
    ).not.toThrow();
  });

  test("PayoutRequest allows REQUESTED -> PAID, forbids PAID -> REQUESTED", () => {
    expect(() =>
      assertAllowedTransition(
        "PayoutRequest",
        "REQUESTED",
        "PAID",
        PayoutRequestAllowedTransitions
      )
    ).not.toThrow();
    expect(() =>
      assertAllowedTransition(
        "PayoutRequest",
        "PAID",
        "REQUESTED",
        PayoutRequestAllowedTransitions
      )
    ).toThrow();
  });
});

