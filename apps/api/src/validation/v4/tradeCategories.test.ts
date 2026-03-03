/**
 * Trade category tests: WELDING and JACK_OF_ALL_TRADES.
 */

import { describe, expect, test } from "vitest";
import { TRADE_CATEGORIES_CANONICAL, isCanonicalTradeCategory } from "./constants";
import { tradeEnumToTradeCategories, serviceTypeToTradeCategory } from "@/src/contractors/tradeMap";

describe("Trade categories WELDING and JACK_OF_ALL_TRADES", () => {
  test("TRADE_CATEGORIES_CANONICAL includes WELDING and JACK_OF_ALL_TRADES", () => {
    expect(TRADE_CATEGORIES_CANONICAL).toContain("WELDING");
    expect(TRADE_CATEGORIES_CANONICAL).toContain("JACK_OF_ALL_TRADES");
  });

  test("Post-a-Job accepts WELDING", () => {
    expect(isCanonicalTradeCategory("WELDING")).toBe(true);
  });

  test("Post-a-Job accepts JACK_OF_ALL_TRADES", () => {
    expect(isCanonicalTradeCategory("JACK_OF_ALL_TRADES")).toBe(true);
  });

  test("Router/contractor matching: WELDING contractor eligible for WELDING jobs", () => {
    const categories = tradeEnumToTradeCategories("WELDING");
    expect(categories).toContain("WELDING");
    expect(categories).toEqual(["WELDING"]);
  });

  test("serviceTypeToTradeCategory maps welding to WELDING", () => {
    expect(serviceTypeToTradeCategory("welding")).toBe("WELDING");
    expect(serviceTypeToTradeCategory("WELD")).toBe("WELDING");
  });

  test("serviceTypeToTradeCategory maps odd jobs to JACK_OF_ALL_TRADES", () => {
    expect(serviceTypeToTradeCategory("odd jobs")).toBe("JACK_OF_ALL_TRADES");
    expect(serviceTypeToTradeCategory("mounting")).toBe("JACK_OF_ALL_TRADES");
  });

  test("Existing categories still work (backward compatibility)", () => {
    expect(isCanonicalTradeCategory("PLUMBING")).toBe(true);
    expect(isCanonicalTradeCategory("HANDYMAN")).toBe(true);
    expect(isCanonicalTradeCategory("FURNITURE_ASSEMBLY")).toBe(true);
  });
});
