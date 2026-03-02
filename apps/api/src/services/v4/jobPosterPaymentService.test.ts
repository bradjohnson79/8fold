import { beforeEach, describe, expect, it, vi } from "vitest";

const selectMock = vi.fn();

vi.mock("@/db/drizzle", () => ({
  db: {
    select: selectMock,
  },
}));

vi.mock("@/src/payments/stripe", () => ({
  stripe: null,
}));

function mockUserRow(row: {
  stripeCustomerId?: string | null;
  stripeDefaultPaymentMethodId?: string | null;
  stripeStatus?: string | null;
  stripeUpdatedAt?: Date | null;
}) {
  const limit = vi.fn().mockResolvedValue([row]);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  selectMock.mockReturnValue({ from });
}

describe("getJobPosterPaymentStatus", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("treats ACTIVE status + saved payment method as connected", async () => {
    mockUserRow({
      stripeDefaultPaymentMethodId: "pm_123",
      stripeStatus: "ACTIVE",
      stripeUpdatedAt: new Date("2026-03-02T00:00:00.000Z"),
    });

    const { getJobPosterPaymentStatus } = await import("./jobPosterPaymentService");
    const status = await getJobPosterPaymentStatus("user_active");

    expect(status.connected).toBe(true);
    expect(status.stripeStatus).toBe("CONNECTED");
  });

  it("treats blank status + saved payment method as connected for legacy rows", async () => {
    mockUserRow({
      stripeDefaultPaymentMethodId: "pm_legacy",
      stripeStatus: "",
      stripeUpdatedAt: new Date("2026-03-02T00:00:00.000Z"),
    });

    const { getJobPosterPaymentStatus } = await import("./jobPosterPaymentService");
    const status = await getJobPosterPaymentStatus("user_legacy");

    expect(status.connected).toBe(true);
    expect(status.stripeStatus).toBe("CONNECTED");
  });

  it("returns not connected when status explicitly not connected", async () => {
    mockUserRow({
      stripeDefaultPaymentMethodId: "pm_456",
      stripeStatus: "NOT_CONNECTED",
    });

    const { getJobPosterPaymentStatus } = await import("./jobPosterPaymentService");
    const status = await getJobPosterPaymentStatus("user_not_connected");

    expect(status.connected).toBe(false);
    expect(status.stripeStatus).toBe("NOT_CONNECTED");
  });
});
