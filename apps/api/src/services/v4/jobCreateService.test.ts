import { describe, expect, test } from "vitest";
import {
  assertAppraisalTokenMatchesPayload,
  assertProvinceMatchesGeocode,
  assertTokenNotConsumed,
  assertUploadOwnershipResolved,
} from "@/src/services/v4/jobCreateService";
import { buildAppraisalPayloadHash, issueAppraisalToken } from "@/src/services/v4/appraisalTokenService";
import { V4JobCreateBodySchema } from "@/src/validation/v4/jobCreateSchema";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/postgres?schema=app";
process.env.V4_APPRAISAL_TOKEN_SECRET ??= "test-secret";

function buildValidCreateInput(overrides: Partial<any> = {}) {
  return {
    title: "Fix sink leak",
    scope: "Replace p-trap and tighten fittings",
    region: "ON",
    state_code: "ON",
    country: "CA",
    trade_category: "PLUMBING",
    appraisalCompleted: true,
    appraisalToken: "placeholder",
    labor_total_cents: 25000,
    city: "Toronto",
    address_full: "100 Main St",
    provinceState: "ON",
    latitude: 43.6532,
    longitude: -79.3832,
    isRegionalRequested: false,
    uploadIds: [],
    availability: ["ASAP"],
    ...overrides,
  };
}

describe("V4 job create hardening invariants", () => {
  test("replay attack is blocked by consumed-token guard", () => {
    expect(() => assertTokenNotConsumed({ token: "already-used-token" })).toThrow("already consumed");
  });

  test("cross-user upload attempt fails ownership assertion", () => {
    expect(() => assertUploadOwnershipResolved(["upload-1"], [])).toThrow("Unknown or unowned uploadIds");
  });

  test("province mismatch is rejected", () => {
    expect(() => assertProvinceMatchesGeocode("ON", "QC")).toThrow("Province mismatch");
  });

  test("tampered latitude/longitude breaks appraisal token binding", () => {
    const userId = "user_123";
    const original = buildValidCreateInput();
    const payloadHash = buildAppraisalPayloadHash({
      userId,
      title: original.title,
      description: original.scope,
      tradeCategory: original.trade_category as any,
      provinceState: original.provinceState,
      latitude: original.latitude,
      longitude: original.longitude,
      isRegionalRequested: original.isRegionalRequested,
    });
    const token = issueAppraisalToken({
      userId,
      payloadHash,
      title: original.title,
      description: original.scope,
      tradeCategory: original.trade_category as any,
      provinceState: original.provinceState,
      latitude: original.latitude,
      longitude: original.longitude,
      isRegionalRequested: original.isRegionalRequested,
    });

    const tampered = V4JobCreateBodySchema.parse(buildValidCreateInput({
      appraisalToken: token,
      latitude: 45.4215,
      longitude: -75.6972,
    }));
    expect(() => assertAppraisalTokenMatchesPayload(tampered, userId)).toThrow("payload mismatch");
  });

  test("missing geo is rejected by schema", () => {
    const input: any = buildValidCreateInput();
    delete input.latitude;
    const parsed = V4JobCreateBodySchema.safeParse(input);
    expect(parsed.success).toBe(false);
  });
});
