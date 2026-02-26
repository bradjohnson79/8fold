import { beforeEach, describe, expect, test, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/postgres?schema=app";

type IdemRow = {
  key: string;
  userId: string;
  requestHash: string;
  status: string;
  jobId: string | null;
};

function buildInput(overrides: Record<string, unknown> = {}) {
  return {
    title: "Fix sink leak",
    scope: "Replace p-trap",
    region: "ON",
    state_code: "ON",
    country: "CA",
    trade_category: "PLUMBING",
    appraisalCompleted: true,
    appraisalToken: "token-1234567890",
    labor_total_cents: 25000,
    city: "Toronto",
    address_full: "100 Main St",
    provinceState: "ON",
    latitude: 43.6532,
    longitude: -79.3832,
    isRegionalRequested: false,
    uploadIds: [],
    availability: {
      monday: { morning: true, afternoon: false, evening: false },
      tuesday: { morning: false, afternoon: false, evening: false },
      wednesday: { morning: false, afternoon: false, evening: false },
      thursday: { morning: false, afternoon: false, evening: false },
      friday: { morning: false, afternoon: false, evening: false },
      saturday: { morning: false, afternoon: false, evening: false },
      sunday: { morning: false, afternoon: false, evening: false },
    },
    ...overrides,
  };
}

function installServiceMocks(ctx: {
  idemRows: IdemRow[];
  insertedJobs: Array<{ id: string }>;
  usedTokens: Set<string>;
}) {
  const tx = {
    select: vi.fn((shape: Record<string, unknown>) => ({
      from: (_table: unknown) => ({
        where: (_where: unknown) => ({
          limit: async (_n: number) => {
            const keys = Object.keys(shape);
            if (keys.includes("requestHash") && keys.includes("status") && keys.includes("jobId")) {
              return ctx.idemRows.length ? [ctx.idemRows[0]] : [];
            }
            if (keys.length === 1 && keys[0] === "token") {
              return Array.from(ctx.usedTokens).map((token) => ({ token }));
            }
            if (keys.includes("latitude") && keys.includes("longitude")) {
              return [{ latitude: 43.6532, longitude: -79.3832 }];
            }
            return [];
          },
        }),
      }),
    })),
    insert: (_table: unknown) => ({
      values: async (values: Record<string, any>) => {
        if ("requestHash" in values && "key" in values && "status" in values) {
          if (ctx.idemRows.find((r) => r.key === values.key)) {
            throw new Error("duplicate key value violates unique constraint");
          }
          ctx.idemRows.push({
            key: String(values.key),
            userId: String(values.userId),
            requestHash: String(values.requestHash),
            status: String(values.status),
            jobId: values.jobId ? String(values.jobId) : null,
          });
          return [];
        }
        if ("title" in values && "scope" in values) {
          ctx.insertedJobs.push({ id: String(values.id) });
          return [];
        }
        if ("token" in values && "jobId" in values) {
          ctx.usedTokens.add(String(values.token));
          return [];
        }
        return [];
      },
    }),
    update: (_table: unknown) => ({
      set: (setValues: Record<string, any>) => ({
        where: async (_where: unknown) => {
          if ("status" in setValues && "jobId" in setValues && ctx.idemRows[0]) {
            ctx.idemRows[0].status = String(setValues.status);
            ctx.idemRows[0].jobId = setValues.jobId ? String(setValues.jobId) : null;
          }
          return [];
        },
      }),
    }),
  };

  vi.doMock("@/db/drizzle", () => ({
    db: {
      transaction: vi.fn(async (fn: (txArg: any) => Promise<unknown>) => await fn(tx)),
    },
  }));
  vi.doMock("@/src/services/v4/geocodeService", () => ({
    reverseGeocodeProvince: vi.fn(async () => "ON"),
  }));
  vi.doMock("@/src/services/v4/geoDistanceService", () => ({
    calculateDistanceKm: vi.fn(() => 10),
  }));
  vi.doMock("@/src/services/v4/appraisalTokenService", () => ({
    buildAppraisalPayloadHash: vi.fn(() => "payload-hash"),
    verifyAppraisalTokenOrThrow: vi.fn(() => ({
      userId: "user_1",
      payloadHash: "payload-hash",
    })),
  }));
}

describe("V4 job create idempotency", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  test("duplicate submit with same payload returns same jobId and no second job row", async () => {
    const idemRows: IdemRow[] = [];
    const insertedJobs: Array<{ id: string }> = [];
    const usedTokens = new Set<string>();
    installServiceMocks({ idemRows, insertedJobs, usedTokens });

    const { createV4Job } = await import("@/src/services/v4/jobCreateService");
    const input = buildInput();
    const first = await createV4Job(input as any, "user_1", "idem-key-1");
    const second = await createV4Job(input as any, "user_1", "idem-key-1");

    expect(first.jobId).toBeTruthy();
    expect(second.jobId).toBe(first.jobId);
    expect(insertedJobs.length).toBe(1);
  });

  test("same key with different payload returns 409", async () => {
    const idemRows: IdemRow[] = [];
    const insertedJobs: Array<{ id: string }> = [];
    const usedTokens = new Set<string>();
    installServiceMocks({ idemRows, insertedJobs, usedTokens });

    const { createV4Job } = await import("@/src/services/v4/jobCreateService");
    const input = buildInput();
    await createV4Job(input as any, "user_1", "idem-key-2");

    await expect(
      createV4Job(buildInput({ scope: "Different payload" }) as any, "user_1", "idem-key-2"),
    ).rejects.toMatchObject({ status: 409, code: "V4_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD" });
  });
});
