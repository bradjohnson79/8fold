import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";

const sendNotificationMock = vi.fn(async () => null);

vi.mock("@/src/services/v4/notifications/notificationService", () => ({
  sendNotification: (...args: unknown[]) => sendNotificationMock(...args),
}));

function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  const match = content.match(/^DATABASE_URL=(.*)$/m);
  if (!match) return;
  let value = match[1].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  process.env.DATABASE_URL = value;
}

describe("notificationEventMapper", () => {
  beforeEach(() => {
    ensureDatabaseUrl();
    sendNotificationMock.mockReset();
  });

  test("CONTRACTOR_ACCEPTED_INVITE emits contractor + poster + router notifications", async () => {
    const { notificationEventMapper } = await import("@/src/services/v4/notifications/notificationEventMapper");
    await notificationEventMapper({
      type: "CONTRACTOR_ACCEPTED_INVITE",
      payload: {
        jobId: "job_1",
        inviteId: "inv_1",
        contractorId: "ctr_1",
        jobPosterId: "jp_1",
        routerId: "rt_1",
        dedupeKeyBase: "contractor_accepted:inv_1",
      },
    });

    expect(sendNotificationMock).toHaveBeenCalledTimes(3);
    const calls = sendNotificationMock.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.userId === "ctr_1" && c.type === "JOB_ASSIGNED")).toBe(true);
    expect(calls.some((c) => c.userId === "jp_1" && c.type === "CONTRACTOR_ACCEPTED")).toBe(true);
    expect(calls.some((c) => c.userId === "rt_1" && c.type === "CONTRACTOR_ACCEPTED")).toBe(true);
  });

  test("NEW_MESSAGE emits recipient notification with THREAD entity", async () => {
    const { notificationEventMapper } = await import("@/src/services/v4/notifications/notificationEventMapper");
    await notificationEventMapper({
      type: "NEW_MESSAGE",
      payload: {
        jobId: "job_1",
        threadId: "thread_1",
        messageId: "msg_1",
        recipientUserId: "user_1",
        recipientRole: "CONTRACTOR",
        dedupeKey: "new_message:msg_1:user_1",
      },
    });

    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendNotificationMock.mock.calls[0]?.[0]).toMatchObject({
      userId: "user_1",
      role: "CONTRACTOR",
      type: "NEW_MESSAGE",
      entityType: "THREAD",
      entityId: "thread_1",
      dedupeKey: "new_message:msg_1:user_1",
    });
  });
});
