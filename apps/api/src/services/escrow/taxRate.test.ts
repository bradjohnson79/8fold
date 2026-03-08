import { beforeEach, describe, expect, test, vi } from "vitest";

let nextRows: Array<{ combinedRate: string | number }> = [];

const limitMock = vi.fn(async () => nextRows);
const whereMock = vi.fn(() => ({ limit: limitMock }));
const fromMock = vi.fn(() => ({ where: whereMock }));
const selectMock = vi.fn(() => ({ from: fromMock }));

vi.mock("@/server/db/drizzle", () => ({
  db: {
    select: () => selectMock(),
  },
}));

import { getTaxRateBps } from "@/src/services/escrow/taxRate";

describe("getTaxRateBps", () => {
  beforeEach(() => {
    nextRows = [];
    selectMock.mockClear();
    fromMock.mockClear();
    whereMock.mockClear();
    limitMock.mockClear();
  });

  test("returns 0 for non-CA", async () => {
    const bps = await getTaxRateBps({ country: "US", province: "WA" });
    expect(bps).toBe(0);
    expect(selectMock).not.toHaveBeenCalled();
  });

  test("uses v4_tax_regions combined_rate when available (stored as percentage)", async () => {
    nextRows = [{ combinedRate: "12.75" }];
    const bps = await getTaxRateBps({ country: "CA", province: "BC" });
    expect(bps).toBe(1275);
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  test("falls back to static CA map when db row missing", async () => {
    nextRows = [];
    const bps = await getTaxRateBps({ country: "CA", province: "ON" });
    expect(bps).toBe(1300);
  });
});
