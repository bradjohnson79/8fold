import { beforeEach, describe, expect, it, vi } from "vitest";
import { jobDraftV2 } from "@/db/schema/jobDraftV2";
import { jobs } from "@/db/schema/job";
import { jobPayments } from "@/db/schema/jobPayment";
import { auditLogs } from "@/db/schema/auditLog";

type DraftState = {
  id: string;
  userId: string;
  currentStep: "PRICING";
  countryCode: "US";
  stateCode: string;
  data: Record<string, unknown>;
  version: number;
  jobId: string | null;
  paymentIntentId: string | null;
};

const state: {
  draft: DraftState;
  jobs: Array<{ id: string }>;
  payment: null | { id: string; jobId: string; stripePaymentIntentId: string };
  auditCount: number;
} = {
  draft: {
    id: "draft-1",
    userId: "poster-1",
    currentStep: "PRICING",
    countryCode: "US",
    stateCode: "CA",
    data: {
      details: { title: "Deterministic Test Job", scope: "This is a sufficiently long deterministic test scope." },
      pricing: { appraisalStatus: "ready", selectedPriceCents: 25000 },
    },
    version: 3,
    jobId: null,
    paymentIntentId: null,
  },
  jobs: [],
  payment: null,
  auditCount: 0,
};

function resetState() {
  state.draft = {
    id: "draft-1",
    userId: "poster-1",
    currentStep: "PRICING",
    countryCode: "US",
    stateCode: "CA",
    data: {
      details: { title: "Deterministic Test Job", scope: "This is a sufficiently long deterministic test scope." },
      pricing: { appraisalStatus: "ready", selectedPriceCents: 25000 },
    },
    version: 3,
    jobId: null,
    paymentIntentId: null,
  };
  state.jobs = [];
  state.payment = null;
  state.auditCount = 0;
}

function cloneSnapshot() {
  return JSON.parse(JSON.stringify(state)) as typeof state;
}

function restoreSnapshot(snapshot: typeof state) {
  state.draft = snapshot.draft;
  state.jobs = snapshot.jobs;
  state.payment = snapshot.payment;
  state.auditCount = snapshot.auditCount;
}

function makeDbLike() {
  return {
    select: (_fields?: unknown) => ({
      from: (table: unknown) => ({
        where: (_cond: unknown) => ({
          limit: async (_n: number) => {
            if (table === jobDraftV2) return [state.draft];
            if (table === jobs) return state.jobs.slice(0, 1);
            if (table === jobPayments) return state.payment ? [{ id: state.payment.id }] : [];
            return [];
          },
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        if (table === jobPayments) {
          state.payment = {
            id: String(values.id),
            jobId: String(values.jobId),
            stripePaymentIntentId: String(values.stripePaymentIntentId),
          };
          return;
        }
        if (table === auditLogs) {
          state.auditCount += 1;
          return;
        }
        if (table === jobs) {
          const id = String(values.id);
          if (!state.jobs.some((j) => j.id === id)) state.jobs.push({ id });
          return;
        }
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (_cond: unknown) => {
          if (table === jobPayments) {
            if (state.payment) {
              state.payment.stripePaymentIntentId = String(values.stripePaymentIntentId ?? state.payment.stripePaymentIntentId);
            }
            return Promise.resolve();
          }
          return {
            returning: async (_fields?: unknown) => {
              if (table === jobDraftV2) {
                if ("jobId" in values && !("paymentIntentId" in values)) {
                  if (state.draft.jobId !== null) return [];
                  state.draft.jobId = String(values.jobId);
                  state.draft.version = Number(values.version ?? state.draft.version);
                  return [{ id: state.draft.id, version: state.draft.version }];
                }
                if ("paymentIntentId" in values) {
                  state.draft.paymentIntentId = String(values.paymentIntentId);
                  state.draft.version = Number(values.version ?? state.draft.version);
                  return [{ id: state.draft.id, version: state.draft.version }];
                }
              }
              return [];
            },
          };
        },
      }),
    }),
    transaction: async <T>(cb: (tx: ReturnType<typeof makeDbLike>) => Promise<T>) => {
      const snapshot = cloneSnapshot();
      try {
        return await cb(makeDbLike());
      } catch (err) {
        restoreSnapshot(snapshot);
        throw err;
      }
    },
  };
}

const createPaymentIntentMock = vi.fn();
const retrievePiMock = vi.fn();

vi.mock("/Users/bradjohnson/Documents/APPS/8Fold_Local/apps/api/src/auth/onboardingGuards.ts", () => ({
  requireJobPosterReady: vi.fn(async () => ({ userId: "poster-1" })),
}));

vi.mock("/Users/bradjohnson/Documents/APPS/8Fold_Local/apps/api/db/drizzle.ts", () => ({
  db: makeDbLike(),
}));

vi.mock("/Users/bradjohnson/Documents/APPS/8Fold_Local/apps/api/src/payments/stripe.ts", () => ({
  createPaymentIntent: createPaymentIntentMock,
  stripe: {
    paymentIntents: {
      retrieve: retrievePiMock,
    },
  },
}));

vi.mock("/Users/bradjohnson/Documents/APPS/8Fold_Local/apps/api/src/lib/getBaseUrl.ts", () => ({
  getBaseUrl: () => "http://localhost:3006",
}));

vi.mock("/Users/bradjohnson/Documents/APPS/8Fold_Local/apps/api/src/server/observability/log.ts", () => ({
  logEvent: vi.fn(),
}));

describe("create-payment-intent atomic claim hardening", () => {
  beforeEach(() => {
    resetState();
    createPaymentIntentMock.mockReset();
    retrievePiMock.mockReset();
    process.env.STRIPE_MODE = "test";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  });

  it("keeps a stable single job across stripe-failure retry", async () => {
    createPaymentIntentMock
      .mockRejectedValueOnce(new Error("simulated stripe outage"))
      .mockResolvedValueOnce({
        paymentIntentId: "pi_1",
        clientSecret: "cs_1",
        status: "requires_payment_method",
      });
    retrievePiMock.mockResolvedValue({ client_secret: "cs_1", amount: 25000 });

    const { POST } = await import("@/app/api/web/job-poster/drafts-v2/create-payment-intent/route");

    const first = await POST(
      new Request("http://localhost/api/web/job-poster/drafts-v2/create-payment-intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draftId: "draft-1", expectedVersion: 3 }),
      }),
    );
    expect(first.status).toBe(500);
    expect(state.jobs).toHaveLength(1);
    const claimedJobId = state.draft.jobId;
    expect(claimedJobId).toBeTruthy();
    expect(state.draft.paymentIntentId).toBeNull();

    const second = await POST(
      new Request("http://localhost/api/web/job-poster/drafts-v2/create-payment-intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draftId: "draft-1", expectedVersion: state.draft.version }),
      }),
    );
    expect(second.status).toBe(200);
    const secondJson = await second.json();
    expect(secondJson.success).toBe(true);
    expect(state.jobs).toHaveLength(1);
    expect(state.draft.jobId).toBe(claimedJobId);
    expect(state.draft.paymentIntentId).toBe("pi_1");
  });
});
