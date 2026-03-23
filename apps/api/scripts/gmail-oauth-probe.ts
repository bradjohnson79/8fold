#!/usr/bin/env tsx
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGmailClientForSender, getConfiguredGmailSenders, getRefreshTokenForSender } from "../src/services/lgs/outreachGmailSenderService";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

async function probeSender(sender: string) {
  const refreshToken = getRefreshTokenForSender(sender);
  if (!refreshToken) {
    return { sender, ok: false, error: "missing_refresh_token" };
  }

  try {
    const gmail = createGmailClientForSender(sender);
    const profile = await gmail.users.getProfile({ userId: "me" });
    const list = await gmail.users.messages.list({ userId: "me", maxResults: 1, q: "in:inbox newer_than:30d" });
    return {
      sender,
      ok: true,
      emailAddress: profile.data.emailAddress ?? null,
      totalMessages: profile.data.messagesTotal ?? null,
      sampleCount: list.data.resultSizeEstimate ?? 0,
    };
  } catch (error) {
    return {
      sender,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const requested = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  const senders = requested ? [requested.trim().toLowerCase()] : getConfiguredGmailSenders();
  const results = [];
  for (const sender of senders) {
    results.push(await probeSender(sender));
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
