import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/db/drizzle", () => ({
  db: {},
}));

let deriveLeadOutreachStatus: typeof import("../outreachAutomationService").deriveLeadOutreachStatus;

beforeAll(async () => {
  const mod = await import("../outreachAutomationService");
  deriveLeadOutreachStatus = mod.deriveLeadOutreachStatus;
});

describe("deriveLeadOutreachStatus", () => {
  it("maps pending review to message generated", () => {
    expect(deriveLeadOutreachStatus("pending_review")).toBe("message_generated");
  });

  it("maps approved to approved", () => {
    expect(deriveLeadOutreachStatus("approved")).toBe("approved");
  });

  it("maps a pending queue row to queued", () => {
    expect(deriveLeadOutreachStatus("approved", "pending")).toBe("queued");
  });

  it("maps sent queue rows to sent", () => {
    expect(deriveLeadOutreachStatus("queued", "sent")).toBe("sent");
  });

  it("maps rejected drafts back to pending", () => {
    expect(deriveLeadOutreachStatus("rejected")).toBe("pending");
  });
});
