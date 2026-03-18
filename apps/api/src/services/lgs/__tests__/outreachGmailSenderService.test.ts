import { describe, expect, it, vi } from "vitest";
import {
  getSenderGmailAuthRecord,
  hasGmailTokenForSender,
  sendOutreachEmail,
  type SenderGmailAuthRecord,
} from "../outreachGmailSenderService";

const connectedSender: SenderGmailAuthRecord = {
  id: "sender-1",
  senderEmail: "info@8fold.app",
  gmailRefreshToken: "refresh-token-1",
  gmailAccessToken: null,
  gmailTokenExpiresAt: null,
  gmailConnected: true,
};

describe("outreachGmailSenderService", () => {
  it("loads sender auth via the DB lookup dependency", async () => {
    const lookupSender = vi.fn().mockResolvedValue(connectedSender);

    const result = await getSenderGmailAuthRecord("Info@8Fold.App", { lookupSender });

    expect(lookupSender).toHaveBeenCalledWith("info@8fold.app");
    expect(result?.gmailRefreshToken).toBe("refresh-token-1");
    expect(result?.gmailConnected).toBe(true);
  });

  it("reports missing token when sender is disconnected", async () => {
    const lookupSender = vi.fn().mockResolvedValue({
      ...connectedSender,
      gmailConnected: false,
      gmailRefreshToken: null,
    });

    await expect(
      sendOutreachEmail(
        {
          subject: "Test",
          body: "Body",
          contactEmail: "lead@example.com",
          senderAccount: "info@8fold.app",
        },
        { lookupSender }
      )
    ).rejects.toThrow("missing_token");

    await expect(hasGmailTokenForSender("info@8fold.app", { lookupSender })).resolves.toBe(false);
  });

  it("sends successfully with a DB-backed refresh token", async () => {
    const lookupSender = vi.fn().mockResolvedValue(connectedSender);
    const sendMessage = vi.fn().mockResolvedValue({ messageId: "gmail-msg-123" });

    const result = await sendOutreachEmail(
      {
        subject: "Test",
        body: "Hello there",
        contactEmail: "lead@example.com",
        senderAccount: "info@8fold.app",
      },
      { lookupSender, sendMessage }
    );

    expect(result).toEqual({ ok: true, messageId: "gmail-msg-123" });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[0].refreshToken).toBe("refresh-token-1");
  });

  it("returns a failed bounce result when Gmail rejects the send", async () => {
    const lookupSender = vi.fn().mockResolvedValue(connectedSender);
    const sendMessage = vi.fn().mockRejectedValue(new Error("550 rejected recipient"));

    const result = await sendOutreachEmail(
      {
        subject: "Test",
        body: "Hello there",
        contactEmail: "lead@example.com",
        senderAccount: "info@8fold.app",
      },
      { lookupSender, sendMessage }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.bounce).toBe(true);
      expect(result.message).toContain("550");
    }
  });
});
