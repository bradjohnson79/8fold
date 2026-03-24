import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorLeads } from "@/db/schema/directoryEngine";
import { createGmailClientForSender, listConfiguredLgsSenders } from "./outreachGmailSenderService";

type ReplySyncResult = {
  scanned: number;
  matched: number;
  updated: number;
  errors: number;
};

function extractEmailAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/<([^>]+)>/);
  const raw = (match?.[1] ?? value).trim().toLowerCase();
  return raw.includes("@") ? raw : null;
}

function parseHeaderDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function syncGmailReplies(): Promise<ReplySyncResult> {
  const result: ReplySyncResult = { scanned: 0, matched: 0, updated: 0, errors: 0 };
  const senderAccounts = listConfiguredLgsSenders();

  const candidateLeads = await db
    .select({
      id: contractorLeads.id,
      email: contractorLeads.email,
      lastContactedAt: contractorLeads.lastContactedAt,
    })
    .from(contractorLeads)
    .where(
      and(
        eq(contractorLeads.archived, false),
        eq(contractorLeads.responseReceived, false),
        eq(contractorLeads.emailBounced, false),
        sql`${contractorLeads.status} IS NULL OR ${contractorLeads.status} != 'archived'`,
        isNotNull(contractorLeads.lastContactedAt)
      )
    );

  if (candidateLeads.length === 0 || senderAccounts.length === 0) {
    return result;
  }

  const leadsByEmail = new Map<string, Array<{ id: string; lastContactedAt: Date | null }>>();
  for (const lead of candidateLeads) {
            const email = lead.email?.trim().toLowerCase();
            if (!email) continue;
    const group = leadsByEmail.get(email) ?? [];
    group.push({ id: lead.id, lastContactedAt: lead.lastContactedAt ?? null });
    leadsByEmail.set(email, group);
  }

  for (const senderAccount of senderAccounts) {
    try {
      const gmail = createGmailClientForSender(senderAccount);
      const list = await gmail.users.messages.list({
        userId: "me",
        q: "in:inbox newer_than:14d",
        maxResults: 50,
      });

      for (const message of list.data.messages ?? []) {
        if (!message.id) continue;
        result.scanned++;

        const messageDetails = await gmail.users.messages.get({
          userId: "me",
          id: message.id,
          format: "metadata",
          metadataHeaders: ["From", "Date"],
        });

        const headers = messageDetails.data.payload?.headers ?? [];
        const fromEmail = extractEmailAddress(headers.find((h) => h.name?.toLowerCase() === "from")?.value);
        if (!fromEmail) continue;

        const candidates = leadsByEmail.get(fromEmail);
        if (!candidates?.length) continue;

        const repliedAt =
          parseHeaderDate(headers.find((h) => h.name?.toLowerCase() === "date")?.value) ??
          new Date();

        const matchedLead = candidates
          .filter((lead) => !lead.lastContactedAt || lead.lastContactedAt <= repliedAt)
          .sort((a, b) => (b.lastContactedAt?.getTime() ?? 0) - (a.lastContactedAt?.getTime() ?? 0))[0];

        if (!matchedLead) continue;
        result.matched++;

        const updated = await db
          .update(contractorLeads)
          .set({
            responseReceived: true,
            lastRepliedAt: repliedAt,
            outreachStage: "replied",
            nextFollowupAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(contractorLeads.id, matchedLead.id),
              eq(contractorLeads.responseReceived, false)
            )
          )
          .returning({ id: contractorLeads.id });

        if (updated.length > 0) {
          result.updated += updated.length;
        }
      }
    } catch (err) {
      result.errors++;
      console.error(`[LGS Replies] Failed syncing replies for ${senderAccount}:`, err);
    }
  }

  if (result.updated > 0) {
    console.log(`[LGS Replies] scanned=${result.scanned} matched=${result.matched} updated=${result.updated}`);
  }

  return result;
}
