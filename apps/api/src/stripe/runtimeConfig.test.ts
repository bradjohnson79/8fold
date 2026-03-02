import { describe, expect, it } from "vitest";
import { getStripeRuntimeConfig } from "./runtimeConfig";

describe("getStripeRuntimeConfig", () => {
  it("returns test mode when both keys are test", () => {
    const result = getStripeRuntimeConfig({
      STRIPE_SECRET_KEY: "sk_test_123",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_123",
    });

    expect(result.ok).toBe(true);
    expect(result.stripeMode).toBe("test");
    expect(result.skMode).toBe("test");
    expect(result.pkMode).toBe("test");
  });

  it("returns mode mismatch when key modes differ", () => {
    const result = getStripeRuntimeConfig({
      STRIPE_SECRET_KEY: "sk_test_123",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_123",
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("STRIPE_MODE_MISMATCH");
  });

  it("returns config missing when keys are absent", () => {
    const result = getStripeRuntimeConfig({});

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("STRIPE_CONFIG_MISSING");
  });
});
