import { describe, it, expect, vi } from "vitest";
import { isValidFieldKey } from "@8fold/shared";

describe("jobDraftV2 save-field", () => {
  describe("isValidFieldKey", () => {
    it("accepts valid field keys", () => {
      expect(isValidFieldKey("profile.fullName")).toBe(true);
      expect(isValidFieldKey("details.title")).toBe(true);
      expect(isValidFieldKey("pricing.selectedPriceCents")).toBe(true);
    });

    it("rejects invalid field keys", () => {
      expect(isValidFieldKey("profile.unknown")).toBe(false);
      expect(isValidFieldKey("details.foo")).toBe(false);
      expect(isValidFieldKey("")).toBe(false);
    });
  });
});
