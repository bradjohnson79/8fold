/**
 * LGS Outreach: Queue scheduler with 5-min interval, daily caps, distributed lock.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  contractorContacts,
  emailMessages,
  emailQueue,
  senderPool,
} from "@/db/schema/directoryEngine";
import { sendOutreachEmail } from "./outreachGmailSenderService";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const HOURLY_CAP_PER_ACCOUNT = 50;
const DAILY_CAP_PER_ACCOUNT = 300;

function getTodayMidnightPacific(): Date {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "2025";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  const pacificDateStr = `${y}-${m}-${d}`;
  return new Date(`${pacificDateStr}T08:00:00.000Z`);
}

async function getLastSendAt(): Promise<Date | null> {
  const [row] = await db
    .select({ sentAt: emailQueue.sentAt })
    .from(emailQueue)
    .where(eq(emailQueue.sendStatus, "sent"))
    .orderBy(sql`${emailQueue.sentAt} desc nulls last`)
    .limit(1);
  return row?.sentAt ?? null;
}

async function getHourlySentCount(senderAccount: string): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(emailQueue)
    .where(
      and(
        eq(emailQueue.sendStatus, "sent"),
        eq(emailQueue.senderAccount, senderAccount),
        sql`${emailQueue.sentAt} >= ${oneHourAgo}`
      )
    );
  return Number(row?.c ?? 0);
}

async function getDailySentCount(senderAccount: string): Promise<number> {
  const midnight = getTodayMidnightPacific();
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(emailQueue)
    .where(
      and(
        eq(emailQueue.sendStatus, "sent"),
        eq(emailQueue.senderAccount, senderAccount),
        sql`${emailQueue.sentAt} >= ${midnight}`
      )
    );
  return Number(row?.c ?? 0);
}

type SenderCapacityRow = {
  senderAccount: string;
  dailyLimit: number;
  gmailConnected: boolean;
  gmailRefreshToken: string | null;
};

function isConnectedSender(sender: SenderCapacityRow): boolean {
  return Boolean(sender.gmailConnected && sender.gmailRefreshToken?.trim());
}

async function selectLegacySenderAccount(): Promise<string | null> {
  const senders = await db
    .select({
      senderAccount: senderPool.senderEmail,
      dailyLimit: senderPool.dailyLimit,
      gmailConnected: senderPool.gmailConnected,
      gmailRefreshToken: senderPool.gmailRefreshToken,
    })
    .from(senderPool)
    .where(eq(senderPool.status, "active"))
    .orderBy(senderPool.senderEmail);

  for (const sender of senders) {
    if (!isConnectedSender(sender)) continue;

    const [dailySent, hourlySent] = await Promise.all([
      getDailySentCount(sender.senderAccount),
      getHourlySentCount(sender.senderAccount),
    ]);

    const dailyCap = Math.max(1, sender.dailyLimit || DAILY_CAP_PER_ACCOUNT);
    if (dailySent < dailyCap && hourlySent < HOURLY_CAP_PER_ACCOUNT) {
      return sender.senderAccount;
    }
  }

  return null;
}

async function pickNextPendingItem(): Promise<{
  queueId: string;
  messageId: string;
  contactId: string;
  contactEmail: string;
  subject: string;
  body: string;
  senderAccount: string;
} | null> {
  const senderAccount = await selectLegacySenderAccount();
  if (!senderAccount) return null;

  const lastSend = await getLastSendAt();
  const now = new Date();
  if (lastSend && now.getTime() - lastSend.getTime() < FIVE_MINUTES_MS) {
    return null;
  }

  const rows = await db
    .select({
      queueId: emailQueue.id,
      messageId: emailQueue.messageId,
      contactId: emailQueue.contactId,
      contactEmail: contractorContacts.email,
      subject: emailMessages.subject,
      body: emailMessages.body,
    })
    .from(emailQueue)
    .innerJoin(emailMessages, eq(emailQueue.messageId, emailMessages.id))
    .innerJoin(contractorContacts, eq(emailQueue.contactId, contractorContacts.id))
    .where(
      and(
        eq(emailQueue.sendStatus, "pending"),
        sql`${emailQueue.scheduledTime} is null`,
        sql`${emailQueue.attempts} < ${MAX_ATTEMPTS}`,
        sql`${contractorContacts.status} != 'invalid_email'`
      )
    )
    .limit(1)
    .for("update", { skipLocked: true });

  const row = rows[0];
  if (!row) return null;

  await db
    .update(emailQueue)
    .set({
      scheduledTime: now,
      senderAccount,
      attempts: sql`${emailQueue.attempts} + 1`,
      lastAttemptAt: now,
    })
    .where(eq(emailQueue.id, row.queueId));

  return {
    queueId: row.queueId,
    messageId: row.messageId,
    contactId: row.contactId,
    contactEmail: row.contactEmail,
    subject: row.subject,
    body: row.body,
    senderAccount,
  };
}

export async function runOutreachScheduler(): Promise<{ sent: number; failed: number }> {
  const item = await pickNextPendingItem();
  if (!item) return { sent: 0, failed: 0 };

  const result = await sendOutreachEmail({
    subject: item.subject,
    body: item.body,
    contactEmail: item.contactEmail,
    senderAccount: item.senderAccount,
  });

  const now = new Date();

  if (result.ok) {
    await db
      .update(emailQueue)
      .set({
        sendStatus: "sent",
        sentAt: now,
      })
      .where(eq(emailQueue.id, item.queueId));

    await db
      .update(contractorContacts)
      .set({ status: "sent" })
      .where(eq(contractorContacts.id, item.contactId));

    return { sent: 1, failed: 0 };
  }

  if (result.bounce) {
    await db
      .update(contractorContacts)
      .set({ status: "invalid_email" })
      .where(eq(contractorContacts.id, item.contactId));
  }

  const attempts = await db
    .select({ attempts: emailQueue.attempts })
    .from(emailQueue)
    .where(eq(emailQueue.id, item.queueId))
    .limit(1);

  const currentAttempts = attempts[0]?.attempts ?? 1;
  const newStatus = currentAttempts >= MAX_ATTEMPTS ? "failed" : "pending";

  await db
    .update(emailQueue)
    .set({
      sendStatus: newStatus,
      errorMessage: result.message,
      lastAttemptAt: now,
    })
    .where(eq(emailQueue.id, item.queueId));

  return { sent: 0, failed: 1 };
}
