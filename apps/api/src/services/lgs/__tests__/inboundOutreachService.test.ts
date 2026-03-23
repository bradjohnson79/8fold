import { describe, expect, it } from "vitest";
import {
  chooseInboundCandidate,
  getBounceMutationPlan,
  getReplyMutationPlan,
  normalizeInboundEmail,
  normalizeInboundSubject,
  type InboundMatchCandidate,
} from "../inboundOutreachService";

function candidate(overrides: Partial<InboundMatchCandidate> = {}): InboundMatchCandidate {
  return {
    campaignType: "jobs",
    queueId: "queue_1",
    messageId: "message_1",
    leadId: "lead_1",
    campaignId: "campaign_1",
    subject: "Quick question about projects in San Jose",
    sentAt: new Date("2026-03-21T16:00:00.000Z"),
    replyReceived: false,
    responseReceived: false,
    emailBounced: false,
    ...overrides,
  };
}

describe("normalizeInboundEmail", () => {
  it("normalizes case and whitespace", () => {
    expect(normalizeInboundEmail("  Hello@Example.COM ")).toBe("hello@example.com");
  });

  it("returns null for empty values", () => {
    expect(normalizeInboundEmail("   ")).toBeNull();
    expect(normalizeInboundEmail(undefined)).toBeNull();
  });
});

describe("normalizeInboundSubject", () => {
  it("strips reply prefixes and normalizes whitespace", () => {
    expect(normalizeInboundSubject(" Re:  Quick question about projects in San Jose  ")).toBe(
      "quick question about projects in san jose"
    );
  });
});

describe("chooseInboundCandidate", () => {
  it("matches the jobs candidate when campaign_type is jobs", () => {
    const selected = chooseInboundCandidate(
      [
        candidate({
          campaignType: "contractor",
          messageId: "contractor_message",
          subject: "Join 8fold",
        }),
        candidate({
          campaignType: "jobs",
          messageId: "job_message",
        }),
      ],
      {
        campaignType: "jobs",
        subject: "Re: Quick question about projects in San Jose",
      }
    );

    expect(selected?.campaignType).toBe("jobs");
    expect(selected?.messageId).toBe("job_message");
  });

  it("returns null when multiple pipelines match and no campaign_type is provided", () => {
    const selected = chooseInboundCandidate(
      [
        candidate({ campaignType: "contractor", messageId: "contractor_message" }),
        candidate({ campaignType: "jobs", messageId: "job_message" }),
      ],
      {
        subject: null,
      }
    );

    expect(selected).toBeNull();
  });

  it("returns the exact subject match when only one candidate matches safely", () => {
    const selected = chooseInboundCandidate(
      [
        candidate({
          messageId: "older_message",
          subject: "Follow-up on San Jose outreach",
        }),
        candidate({
          messageId: "matched_message",
          subject: "Quick question about projects in San Jose",
        }),
      ],
      {
        campaignType: "jobs",
        subject: "Re: Quick question about projects in San Jose",
      }
    );

    expect(selected?.messageId).toBe("matched_message");
  });
});

describe("getReplyMutationPlan", () => {
  it("increments reply_count for the first reply", () => {
    expect(getReplyMutationPlan(candidate())).toEqual({
      markMessageReplyReceived: true,
      incrementCampaignReplyCount: true,
    });
  });

  it("does not increment reply_count for duplicate replies", () => {
    expect(getReplyMutationPlan(candidate({ replyReceived: true }))).toEqual({
      markMessageReplyReceived: true,
      incrementCampaignReplyCount: false,
    });
  });
});

describe("getBounceMutationPlan", () => {
  it("increments bounce_count for the first bounce", () => {
    expect(getBounceMutationPlan(candidate())).toEqual({
      markLeadBounced: true,
      incrementCampaignBounceCount: true,
    });
  });

  it("does not increment bounce_count twice for duplicate bounce events", () => {
    expect(getBounceMutationPlan(candidate({ emailBounced: true }))).toEqual({
      markLeadBounced: true,
      incrementCampaignBounceCount: false,
    });
  });
});
