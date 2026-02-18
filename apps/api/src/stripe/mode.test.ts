import { describe, expect, it } from "vitest";
import { assertStripeKeysMatchMode, getStripeModeFromEnv } from "./mode";

describe("stripe mode safety", () => {
  it("defaults STRIPE_MODE to test when unset", () => {
    expect(getStripeModeFromEnv({})).toBe("test");
  });

  it("throws when STRIPE_MODE=live but secret is sk_test", () => {
    expect(() => assertStripeKeysMatchMode({ mode: "live", secretKey: "sk_test_123" })).toThrow(/mismatch/i);
  });

  it("throws when STRIPE_MODE=test but secret is sk_live", () => {
    const skLive = "sk_" + "live_" + "123";
    expect(() => assertStripeKeysMatchMode({ mode: "test", secretKey: skLive })).toThrow(/mismatch/i);
  });

  it("allows unknown key prefixes (cannot validate)", () => {
    expect(() => assertStripeKeysMatchMode({ mode: "live", secretKey: "env:rotated" })).not.toThrow();
  });
});

