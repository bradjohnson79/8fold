import { describe, expect, it } from "vitest";
import {
  extractEmailAddress,
  extractFailedRecipient,
  isLikelyBounceMessage,
} from "../gmailInboundService";
import { getPipelineForInboundMailbox, getTrackedInboundMailboxes } from "../gmailInboundConfig";

describe("gmail inbound config", () => {
  it("maps tracked inboxes to the expected pipelines", () => {
    expect(getPipelineForInboundMailbox("partners@8fold.app")).toBe("contractor");
    expect(getPipelineForInboundMailbox("support@8fold.app")).toBe("contractor");
    expect(getPipelineForInboundMailbox("hello@8fold.app")).toBe("jobs");
    expect(getPipelineForInboundMailbox("info@8fold.app")).toBe("jobs");
    expect(getTrackedInboundMailboxes()).toEqual([
      "partners@8fold.app",
      "support@8fold.app",
      "hello@8fold.app",
      "info@8fold.app",
    ]);
  });
});

describe("extractEmailAddress", () => {
  it("parses mailbox strings with display names", () => {
    expect(extractEmailAddress("Mail Delivery Subsystem <mailer-daemon@googlemail.com>")).toBe(
      "mailer-daemon@googlemail.com"
    );
  });

  it("parses bare addresses", () => {
    expect(extractEmailAddress("prospect@example.com")).toBe("prospect@example.com");
  });
});

describe("isLikelyBounceMessage", () => {
  it("classifies common Gmail delivery failures as bounces", () => {
    expect(
      isLikelyBounceMessage({
        fromEmail: "mailer-daemon@googlemail.com",
        subject: "Delivery Status Notification (Failure)",
        body: "550 mailbox unavailable",
      })
    ).toBe(true);
  });

  it("does not classify normal prospect replies as bounces", () => {
    expect(
      isLikelyBounceMessage({
        fromEmail: "prospect@example.com",
        subject: "Re: Quick question",
        body: "Yes, send details.",
      })
    ).toBe(false);
  });
});

describe("extractFailedRecipient", () => {
  it("extracts failed recipient from DSN headers first", () => {
    const failed = extractFailedRecipient({
      headers: [
        { name: "Final-Recipient", value: "rfc822; bounced@example.com" },
      ],
      body: "irrelevant",
    });
    expect(failed).toBe("bounced@example.com");
  });

  it("falls back to body extraction when headers are absent", () => {
    const failed = extractFailedRecipient({
      body: "The response was: 550 5.1.1 <lost@example.com>: Recipient address rejected",
    });
    expect(failed).toBe("lost@example.com");
  });
});
