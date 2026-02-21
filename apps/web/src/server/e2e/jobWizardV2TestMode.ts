import { createHash, randomUUID } from "crypto";

type Step = "PROFILE" | "DETAILS" | "PRICING" | "PAYMENT" | "CONFIRMED";

type DraftFieldState = {
  status: "idle" | "saving" | "saved" | "error";
  savedAt: string | null;
};

type DraftShape = {
  id: string;
  version: number;
  currentStep: Step;
  countryCode: "US" | "CA";
  stateCode: string;
  data: Record<string, unknown>;
  validation: Record<string, unknown>;
  fieldStates: Record<string, DraftFieldState>;
  lastSavedAt: string | null;
  jobId: string | null;
  paymentIntentId: string | null;
};

type TestState = {
  draft: DraftShape;
  fieldHashes: Record<string, string>;
  funded: boolean;
};

const TEST_USER = "poster_test";
const transitions: Record<Step, Step[]> = {
  PROFILE: ["DETAILS"],
  DETAILS: ["PRICING"],
  PRICING: ["PAYMENT"],
  PAYMENT: ["CONFIRMED"],
  CONFIRMED: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;
  const parts = path.split(".");
  let cursor: Record<string, unknown> = out;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!isRecord(cursor[key])) cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
  return out;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cursor: unknown = obj;
  for (const key of parts) {
    if (!isRecord(cursor) || !(key in cursor)) return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

function nowIso(): string {
  return new Date().toISOString();
}

function computeValidation(data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const title = String(getNestedValue(data, "details.title") ?? "").trim();
  const scope = String(getNestedValue(data, "details.scope") ?? "").trim();
  const price = Number(getNestedValue(data, "pricing.selectedPriceCents"));
  if (title.length > 0 && title.length < 5) out["details.title"] = "At least 5 characters";
  if (scope.length > 0 && scope.length < 20) out["details.scope"] = "At least 20 characters";
  if (!Number.isNaN(price) && price <= 0) out["pricing.selectedPriceCents"] = "Invalid price";
  return out;
}

function stepInvariantValid(step: Step, data: Record<string, unknown>): boolean {
  const title = String(getNestedValue(data, "details.title") ?? "").trim();
  const scope = String(getNestedValue(data, "details.scope") ?? "").trim();
  const appraisalStatus = String(getNestedValue(data, "pricing.appraisalStatus") ?? "").trim();
  const selectedPrice = Number(getNestedValue(data, "pricing.selectedPriceCents"));
  switch (step) {
    case "PROFILE":
      return true;
    case "DETAILS":
      return title.length >= 5 && scope.length >= 20;
    case "PRICING":
      return appraisalStatus === "ready" && Number.isFinite(selectedPrice) && selectedPrice > 0;
    case "PAYMENT":
      return true;
    case "CONFIRMED":
      return true;
    default:
      return false;
  }
}

function makeDefaultDraft(userId: string): TestState {
  const baseId = `draft_${userId}`;
  return {
    funded: false,
    fieldHashes: {},
    draft: {
      id: baseId,
      version: 1,
      currentStep: "DETAILS",
      countryCode: "US",
      stateCode: "CA",
      data: { details: { title: "Seed title", scope: "Seed scope text long enough" } },
      validation: {},
      fieldStates: {},
      lastSavedAt: null,
      jobId: null,
      paymentIntentId: null,
    },
  };
}

function store(): Map<string, TestState> {
  const key = "__JOB_WIZARD_V2_E2E_STORE__";
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g[key]) g[key] = new Map<string, TestState>();
  return g[key] as Map<string, TestState>;
}

export function isE2ETestModeEnabled(): boolean {
  return String(process.env.E2E_TEST_MODE ?? "0").trim() === "1";
}

export function traceId(): string {
  return randomUUID();
}

export function getE2EUserIdFromHeader(req: Request): string | null {
  if (!isE2ETestModeEnabled()) return null;
  const raw = String(req.headers.get("x-e2e-user") ?? "").trim();
  return raw === TEST_USER ? raw : null;
}

export function modeDisabledResponse() {
  return Response.json(
    { success: false, code: "E2E_TEST_MODE_DISABLED", message: "E2E test mode is disabled.", traceId: traceId() },
    { status: 404 },
  );
}

export function invalidE2EIdentityResponse() {
  return Response.json(
    { success: false, code: "E2E_IDENTITY_REQUIRED", message: "Missing required x-e2e-user header.", traceId: traceId() },
    { status: 401 },
  );
}

export function getOrCreateState(userId: string): TestState {
  const s = store();
  const existing = s.get(userId);
  if (existing) return existing;
  const created = makeDefaultDraft(userId);
  s.set(userId, created);
  return created;
}

export function resetState(userId: string): TestState {
  const next = makeDefaultDraft(userId);
  store().set(userId, next);
  return next;
}

export function seedPricingReady(userId: string): TestState {
  const seeded: TestState = {
    funded: false,
    fieldHashes: {
      "details.title": createHash("sha256").update(JSON.stringify("Pricing Ready Job")).digest("hex"),
      "details.scope": createHash("sha256").update(JSON.stringify("Deterministic pricing-ready scope description")).digest("hex"),
    },
    draft: {
      id: `draft_${userId}`,
      version: 10,
      currentStep: "PRICING",
      countryCode: "US",
      stateCode: "CA",
      data: {
        details: {
          title: "Pricing Ready Job",
          scope: "Deterministic pricing-ready scope description",
          jobType: "urban",
        },
        pricing: { appraisalStatus: "ready", selectedPriceCents: 25000 },
      },
      validation: {},
      fieldStates: {
        "details.title": { status: "saved", savedAt: nowIso() },
        "details.scope": { status: "saved", savedAt: nowIso() },
      },
      lastSavedAt: nowIso(),
      jobId: null,
      paymentIntentId: null,
    },
  };
  store().set(userId, seeded);
  return seeded;
}

export function saveField(
  state: TestState,
  args: { expectedVersion?: number; fieldKey?: string; value?: unknown },
) {
  const t = traceId();
  const fieldKey = String(args.fieldKey ?? "").trim();
  if (!fieldKey) {
    return { status: 400, body: { success: false, code: "INVALID_FIELD_KEY", message: "Invalid field key.", traceId: t } };
  }
  if (typeof args.expectedVersion !== "number") {
    return { status: 400, body: { success: false, code: "MISSING_EXPECTED_VERSION", message: "Missing expectedVersion.", traceId: t } };
  }
  if (args.expectedVersion !== state.draft.version) {
    return {
      status: 409,
      body: { success: false, code: "VERSION_CONFLICT", message: "Draft version conflict.", draft: state.draft, traceId: t },
    };
  }
  const hash = createHash("sha256").update(JSON.stringify(args.value)).digest("hex");
  if (state.fieldHashes[fieldKey] === hash) {
    return { status: 200, body: { success: true, draft: state.draft, traceId: t } };
  }
  state.fieldHashes[fieldKey] = hash;
  state.draft.data = setNestedValue(state.draft.data, fieldKey, args.value);
  state.draft.validation = computeValidation(state.draft.data);
  state.draft.version += 1;
  state.draft.lastSavedAt = nowIso();
  state.draft.fieldStates[fieldKey] = { status: "saved", savedAt: state.draft.lastSavedAt };
  return { status: 200, body: { success: true, draft: state.draft, traceId: t } };
}

export function advanceStep(
  state: TestState,
  args: { expectedVersion?: number; targetStep?: string },
) {
  const t = traceId();
  const target = String(args.targetStep ?? "").trim() as Step;
  if (typeof args.expectedVersion !== "number") {
    return { status: 400, body: { success: false, code: "MISSING_EXPECTED_VERSION", message: "Missing expectedVersion.", traceId: t } };
  }
  if (args.expectedVersion !== state.draft.version) {
    return {
      status: 409,
      body: { success: false, code: "VERSION_CONFLICT", message: "Draft version conflict.", draft: state.draft, traceId: t },
    };
  }
  const current = state.draft.currentStep;
  if (!transitions[current].includes(target)) {
    return {
      status: 409,
      body: { success: false, code: "STEP_INVALID", message: "Step transition is not allowed.", draft: state.draft, traceId: t },
    };
  }
  if (!stepInvariantValid(current, state.draft.data)) {
    return {
      status: 409,
      body: { success: false, code: "STEP_INVALID", message: "Current step invariants are not satisfied.", draft: state.draft, traceId: t },
    };
  }
  state.draft.currentStep = target;
  state.draft.version += 1;
  return {
    status: 200,
    body: {
      success: true,
      draft: state.draft,
      currentStep: target,
      nextAllowedStep: transitions[target][0] ?? null,
      traceId: t,
    },
  };
}

export function createPaymentIntent(state: TestState, args: { expectedVersion?: number }) {
  const t = traceId();
  if (state.draft.currentStep !== "PRICING") {
    return { status: 409, body: { success: false, code: "STEP_INVALID", message: "Payment intent can only be created from PRICING step.", traceId: t } };
  }
  if (state.draft.paymentIntentId) {
    return {
      status: 200,
      body: {
        success: true,
        clientSecret: `cs_test_${state.draft.id}`,
        returnUrl: "/app/job-poster/payment/return-v2",
        amount: 25000,
        currency: "usd",
        traceId: t,
      },
    };
  }
  if (typeof args.expectedVersion !== "number") {
    return { status: 400, body: { success: false, code: "MISSING_EXPECTED_VERSION", message: "Missing expectedVersion.", traceId: t } };
  }
  if (args.expectedVersion !== state.draft.version) {
    return { status: 409, body: { success: false, code: "VERSION_CONFLICT", message: "Draft version conflict.", traceId: t } };
  }
  state.draft.jobId = `job_${state.draft.id}`;
  state.draft.paymentIntentId = `pi_${state.draft.id}`;
  state.draft.version += 1;
  return {
    status: 200,
    body: {
      success: true,
      clientSecret: `cs_test_${state.draft.id}`,
      returnUrl: "/app/job-poster/payment/return-v2",
      amount: 25000,
      currency: "usd",
      traceId: t,
    },
  };
}

export function verifyPayment(state: TestState, paymentIntentId: string) {
  const t = traceId();
  if (!paymentIntentId) {
    return { status: 400, body: { success: false, code: "MISSING_PAYMENT_INTENT_ID", message: "Missing paymentIntentId.", traceId: t } };
  }
  const expectedPi = state.draft.paymentIntentId ?? `pi_${state.draft.id}`;
  if (paymentIntentId !== expectedPi) {
    return { status: 400, body: { success: false, code: "PAYMENT_INTENT_NOT_FOUND", message: "Payment intent not found.", traceId: t } };
  }
  const already = state.funded || state.draft.currentStep === "CONFIRMED";
  state.funded = true;
  if (state.draft.currentStep !== "CONFIRMED") {
    state.draft.currentStep = "CONFIRMED";
    state.draft.version += 1;
  }
  return {
    status: 200,
    body: {
      success: true,
      jobId: state.draft.jobId ?? `job_${state.draft.id}`,
      funded: true,
      idempotent: already,
      traceId: t,
    },
  };
}
