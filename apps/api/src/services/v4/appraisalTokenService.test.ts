import { describe, expect, test } from "vitest";
import {
  APPRAISAL_TOKEN_TTL_SECONDS,
  buildAppraisalPayloadHash,
  issueAppraisalToken,
  verifyAppraisalToken,
  verifyAppraisalTokenOrThrow,
} from "@/src/services/v4/appraisalTokenService";

process.env.V4_APPRAISAL_TOKEN_SECRET ??= "test-secret";

describe("V4 appraisal token hardening", () => {
  test("token is bound to user and payload hash", () => {
    const payloadHash = buildAppraisalPayloadHash({
      userId: "user_a",
      title: "T",
      description: "D",
      tradeCategory: "PLUMBING",
      provinceState: "ON",
      latitude: 43.6,
      longitude: -79.3,
      isRegionalRequested: false,
    });
    const token = issueAppraisalToken({
      userId: "user_a",
      payloadHash,
      title: "T",
      description: "D",
      tradeCategory: "PLUMBING",
      provinceState: "ON",
      latitude: 43.6,
      longitude: -79.3,
      isRegionalRequested: false,
    });

    expect(() =>
      verifyAppraisalTokenOrThrow({
        token,
        expectedUserId: "user_b",
        expectedPayloadHash: payloadHash,
      })
    ).toThrow("user mismatch");
  });

  test("token expires after TTL", () => {
    const payloadHash = buildAppraisalPayloadHash({
      userId: "user_a",
      title: "T",
      description: "D",
      tradeCategory: "PLUMBING",
      provinceState: "ON",
      latitude: 43.6,
      longitude: -79.3,
      isRegionalRequested: false,
    });
    const token = issueAppraisalToken({
      userId: "user_a",
      payloadHash,
      title: "T",
      description: "D",
      tradeCategory: "PLUMBING",
      provinceState: "ON",
      latitude: 43.6,
      longitude: -79.3,
      isRegionalRequested: false,
    });
    const claims = verifyAppraisalToken(token);
    expect(claims).not.toBeNull();
    const now = (claims?.iat ?? 0) + APPRAISAL_TOKEN_TTL_SECONDS + 1;

    expect(() =>
      verifyAppraisalTokenOrThrow({
        token,
        expectedUserId: "user_a",
        expectedPayloadHash: payloadHash,
        nowEpochSeconds: now,
      })
    ).toThrow("expired");
  });
});
