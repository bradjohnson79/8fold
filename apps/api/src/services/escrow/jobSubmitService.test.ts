import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/db/drizzle", () => ({ db: {} }));
vi.mock("@/db/schema/enums", () => ({
  countryCodeEnum: { enumValues: ["CA", "US"] },
  currencyCodeEnum: { enumValues: ["CAD", "USD"] },
  jobStatusEnum: { enumValues: ["OPEN_FOR_ROUTING"] },
  jobTypeEnum: { enumValues: ["urban", "regional"] },
  paymentStatusEnum: { enumValues: ["AUTHORIZED", "FUNDS_SECURED"] },
  routingStatusEnum: { enumValues: ["UNROUTED"] },
  tradeCategoryEnum: { enumValues: ["HANDYMAN"] },
}));
vi.mock("@/db/schema/job", () => ({ jobs: {} }));
vi.mock("@/db/schema/jobPayment", () => ({ jobPayments: {} }));
vi.mock("@/db/schema/jobPhoto", () => ({ jobPhotos: {} }));
vi.mock("@/db/schema/v4JobUpload", () => ({ v4JobUploads: {} }));
vi.mock("@/src/payments/stripe", () => ({ stripe: null }));
vi.mock("@/src/services/escrow/ledger", () => ({
  writeAuthHoldLedger: vi.fn(),
  writeChargeLedger: vi.fn(),
}));
vi.mock("@/src/services/v4/paymentFeeConfigService", () => ({ getFeeConfig: vi.fn() }));
vi.mock("@/src/services/v4/modelAPricingService", () => ({ computeModelAPricing: vi.fn() }));

describe("buildSchemaSafeInsertPayload", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("filters insert payload to existing schema columns", async () => {
    const { buildSchemaSafeInsertPayload } = await import("@/src/services/escrow/jobSubmitService");
    const jobInsertValues = {
      id: "job_1",
      status: "OPEN_FOR_ROUTING",
      title: "A",
      scope: "B",
      unsupported_col: 123,
    };
    const schemaColumns = new Set(["id", "status", "title", "scope"]);

    const { filteredInsert, droppedColumns } = buildSchemaSafeInsertPayload(jobInsertValues, schemaColumns);

    expect(filteredInsert).toEqual({
      id: "job_1",
      status: "OPEN_FOR_ROUTING",
      title: "A",
      scope: "B",
    });
    expect(droppedColumns).toEqual(["unsupported_col"]);
  });

  test("keeps required fields when schema contains them", async () => {
    const { buildSchemaSafeInsertPayload } = await import("@/src/services/escrow/jobSubmitService");
    const jobInsertValues = {
      id: "job_1",
      title: "A",
      scope: "B",
      region: "on",
      status: "OPEN_FOR_ROUTING",
      routing_status: "UNROUTED",
      job_poster_user_id: "user_1",
    };
    const schemaColumns = new Set(Object.keys(jobInsertValues));

    const { filteredInsert, droppedColumns } = buildSchemaSafeInsertPayload(jobInsertValues, schemaColumns);

    expect(filteredInsert).toEqual(jobInsertValues);
    expect(droppedColumns).toEqual([]);
  });

  test("surfaces required-column drop under schema mismatch simulation", async () => {
    const { buildSchemaSafeInsertPayload } = await import("@/src/services/escrow/jobSubmitService");
    const jobInsertValues = {
      id: "job_1",
      title: "A",
      scope: "B",
      region: "on",
      status: "OPEN_FOR_ROUTING",
      routing_status: "UNROUTED",
      job_poster_user_id: "user_1",
    };
    const schemaColumns = new Set(["id", "title", "scope", "region", "routing_status", "job_poster_user_id"]);

    const { droppedColumns } = buildSchemaSafeInsertPayload(jobInsertValues, schemaColumns);

    expect(droppedColumns).toContain("status");
  });
});

