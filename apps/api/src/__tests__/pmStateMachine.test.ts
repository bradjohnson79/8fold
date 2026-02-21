import { describe, expect, test } from "vitest";
import {
  assertAllowedTransition,
  PMAllowedTransitions,
} from "@8fold/shared";

describe("PM state machine", () => {
  test("DRAFT -> SUBMITTED allowed", () => {
    expect(() =>
      assertAllowedTransition("PMRequest", "DRAFT", "SUBMITTED", PMAllowedTransitions)
    ).not.toThrow();
  });

  test("SUBMITTED -> APPROVED allowed", () => {
    expect(() =>
      assertAllowedTransition("PMRequest", "SUBMITTED", "APPROVED", PMAllowedTransitions)
    ).not.toThrow();
  });

  test("SUBMITTED -> AMENDMENT_REQUESTED allowed", () => {
    expect(() =>
      assertAllowedTransition("PMRequest", "SUBMITTED", "AMENDMENT_REQUESTED", PMAllowedTransitions)
    ).not.toThrow();
  });

  test("SUBMITTED -> REJECTED allowed", () => {
    expect(() =>
      assertAllowedTransition("PMRequest", "SUBMITTED", "REJECTED", PMAllowedTransitions)
    ).not.toThrow();
  });

  test("AMENDMENT_REQUESTED -> DRAFT allowed", () => {
    expect(() =>
      assertAllowedTransition("PMRequest", "AMENDMENT_REQUESTED", "DRAFT", PMAllowedTransitions)
    ).not.toThrow();
  });

  test("AMENDMENT_REQUESTED -> SUBMITTED allowed", () => {
    expect(() =>
      assertAllowedTransition("PMRequest", "AMENDMENT_REQUESTED", "SUBMITTED", PMAllowedTransitions)
    ).not.toThrow();
  });

  test("APPROVED -> PAYMENT_PENDING allowed", () => {
    expect(() =>
      assertAllowedTransition("PMRequest", "APPROVED", "PAYMENT_PENDING", PMAllowedTransitions)
    ).not.toThrow();
  });

  test("FUNDED -> RECEIPTS_SUBMITTED allowed", () => {
    expect(() =>
      assertAllowedTransition("PMRequest", "FUNDED", "RECEIPTS_SUBMITTED", PMAllowedTransitions)
    ).not.toThrow();
  });

  test("VERIFIED -> RELEASED allowed", () => {
    expect(() =>
      assertAllowedTransition("PMRequest", "VERIFIED", "RELEASED", PMAllowedTransitions)
    ).not.toThrow();
  });

  test("RELEASED -> CLOSED allowed", () => {
    expect(() =>
      assertAllowedTransition("PMRequest", "RELEASED", "CLOSED", PMAllowedTransitions)
    ).not.toThrow();
  });

  test("DRAFT -> APPROVED forbidden", () => {
    expect(() =>
      assertAllowedTransition("PMRequest", "DRAFT", "APPROVED", PMAllowedTransitions)
    ).toThrow();
  });

  test("CLOSED -> any forbidden", () => {
    expect(() =>
      assertAllowedTransition("PMRequest", "CLOSED", "DRAFT", PMAllowedTransitions)
    ).toThrow();
  });

  test("REJECTED -> any forbidden", () => {
    expect(() =>
      assertAllowedTransition("PMRequest", "REJECTED", "SUBMITTED", PMAllowedTransitions)
    ).toThrow();
  });
});
