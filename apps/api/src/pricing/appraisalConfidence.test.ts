import { describe, expect, test } from "vitest";
import { computeAppraisalConfidence, deriveDynamicPriceRange } from "@/src/pricing/appraisalConfidence";

function scoreFor(input: {
  title: string;
  description: string;
  tradeCategory: string;
  median?: number;
  low?: number;
  high?: number;
  isRegionalRequested?: boolean;
}) {
  const median = input.median ?? 400;
  const range =
    typeof input.low === "number" && typeof input.high === "number"
      ? { low: input.low, high: input.high }
      : deriveDynamicPriceRange({
          title: input.title,
          description: input.description,
          tradeCategory: input.tradeCategory,
          median,
          isRegionalRequested: input.isRegionalRequested,
        });

  return computeAppraisalConfidence({
    title: input.title,
    description: input.description,
    tradeCategory: input.tradeCategory,
    median,
    low: range.low,
    high: range.high,
  });
}

describe("appraisal confidence scoring", () => {
  test("clear moving job scores high", () => {
    const result = scoreFor({
      title: "Move 1-bedroom apartment",
      description:
        "Need movers for a 1-bedroom apartment. About 12 boxes, a sofa, bed frame, dresser, and dining table. Pickup is on the 2nd floor, dropoff is 8 miles away, both locations have elevator access.",
      tradeCategory: "MOVING",
      median: 450,
    });

    expect(result.confidenceLabel).toBe("HIGH");
    expect(result.confidenceScore).toBeGreaterThanOrEqual(0.75);
  });

  test("vague job scores low", () => {
    const result = scoreFor({
      title: "Need help",
      description: "Need help with some stuff around the house. Not sure exactly what or how long.",
      tradeCategory: "HANDYMAN",
      median: 250,
    });

    expect(result.confidenceLabel).toBe("LOW");
    expect(result.confidenceScore).toBeLessThan(0.5);
  });

  test("unknown category scores low", () => {
    const result = scoreFor({
      title: "Custom specialty project",
      description: "Install a one-off specialty fixture with limited details available right now.",
      tradeCategory: "UNKNOWN_CATEGORY",
      median: 500,
    });

    expect(result.confidenceLabel).toBe("LOW");
    expect(result.categoryConfidence).toBeLessThan(0.3);
  });

  test("wide pricing spread scores low", () => {
    const result = scoreFor({
      title: "Panel upgrade",
      description: "Upgrade electrical panel from 100A to 200A with permit handling and breaker relabeling.",
      tradeCategory: "ELECTRICAL",
      median: 1000,
      low: 500,
      high: 1700,
    });

    expect(result.spreadRatio).toBeGreaterThan(0.6);
    expect(result.confidenceLabel).toBe("LOW");
  });

  test("mixed signals score medium", () => {
    const result = scoreFor({
      title: "Fence repair",
      description: "Repair backyard fence after wind damage. About three panels appear loose and one post may need replacement.",
      tradeCategory: "FENCING",
      median: 650,
    });

    expect(result.confidenceLabel).toBe("MEDIUM");
    expect(result.confidenceScore).toBeGreaterThanOrEqual(0.5);
    expect(result.confidenceScore).toBeLessThan(0.75);
  });
});
