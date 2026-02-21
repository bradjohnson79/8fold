import { describe, expect, test } from "vitest";
import {
  assertAllowedTransition,
  JobAllowedTransitions,
  PayoutRequestAllowedTransitions
} from "@8fold/shared";

describe("state machines", () => {
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

