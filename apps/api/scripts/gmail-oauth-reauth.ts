#!/usr/bin/env tsx
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { exec } from "node:child_process";
import { google } from "googleapis";
import {
  GMAIL_INBOUND_SCOPES,
  GMAIL_OAUTH_REDIRECT_URI,
  GMAIL_SEND_SCOPES,
  SENDER_ENV_PAIRS,
} from "../src/services/lgs/outreachGmailSenderService";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

function parseArgs() {
  const args = process.argv.slice(2);
  const sender = args.find((arg) => !arg.startsWith("--"))?.trim().toLowerCase();
  const sendOnly = args.includes("--send-only");
  const noOpen = args.includes("--no-open");
  return { sender, sendOnly, noOpen };
}

function getEnvKeyForSender(sender: string): string | null {
  const normalized = sender.trim().toLowerCase();
  for (let i = 0; i < SENDER_ENV_PAIRS.length; i += 1) {
    const pair = SENDER_ENV_PAIRS[i];
    if (pair.sender?.trim().toLowerCase() === normalized) {
      return `GMAIL_REFRESH_TOKEN_${i + 1}`;
    }
  }
  return null;
}

function updateEnvFile(envPath: string, envKey: string, value: string) {
  const current = readFileSync(envPath, "utf8");
  const pattern = new RegExp(`^${envKey}=.*$`, "m");
  const nextLine = `${envKey}=${value}`;
  const updated = pattern.test(current)
    ? current.replace(pattern, nextLine)
    : `${current.trimEnd()}\n${nextLine}\n`;
  writeFileSync(envPath, updated, "utf8");
}

function openUrl(url: string) {
  exec(`open "${url}"`, () => {});
}

async function main() {
  const { sender, sendOnly, noOpen } = parseArgs();
  if (!sender) {
    console.error("Usage: pnpm -C apps/api exec tsx scripts/gmail-oauth-reauth.ts <sender-email> [--send-only] [--no-open]");
    process.exit(1);
  }

  const envKey = getEnvKeyForSender(sender);
  if (!envKey) {
    console.error(`Unknown sender mapping for ${sender}`);
    process.exit(1);
  }

  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET are required");
    process.exit(1);
  }

  const redirect = new URL(GMAIL_OAUTH_REDIRECT_URI);
  const scopes = sendOnly ? GMAIL_SEND_SCOPES : GMAIL_INBOUND_SCOPES;
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, GMAIL_OAUTH_REDIRECT_URI);

  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    login_hint: sender,
    scope: scopes,
    include_granted_scopes: false,
  });

  console.log(JSON.stringify({
    sender,
    envKey,
    redirectUri: GMAIL_OAUTH_REDIRECT_URI,
    scopes,
    authUrl,
  }, null, 2));

  if (!noOpen) {
    openUrl(authUrl);
  }

  await new Promise<void>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url ?? "/", GMAIL_OAUTH_REDIRECT_URI);
        if (reqUrl.pathname !== redirect.pathname) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        const code = reqUrl.searchParams.get("code");
        const error = reqUrl.searchParams.get("error");
        if (error) {
          res.statusCode = 400;
          res.end(`OAuth error: ${error}`);
          server.close(() => reject(new Error(error)));
          return;
        }
        if (!code) {
          res.statusCode = 400;
          res.end("Missing code");
          return;
        }

        const tokenResponse = await oauth2.getToken(code);
        const refreshToken = tokenResponse.tokens.refresh_token;
        if (!refreshToken) {
          res.statusCode = 500;
          res.end("No refresh token returned. Revoke existing app consent and retry with prompt=consent.");
          server.close(() => reject(new Error("no_refresh_token_returned")));
          return;
        }

        const envPath = path.join(__dirname, "..", ".env.local");
        updateEnvFile(envPath, envKey, refreshToken);

        res.statusCode = 200;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end(`OAuth success for ${sender}. Stored ${envKey} in .env.local`);

        console.log(JSON.stringify({
          sender,
          envKey,
          redirectUri: GMAIL_OAUTH_REDIRECT_URI,
          scopes,
          refreshToken,
        }, null, 2));

        server.close(() => resolve());
      } catch (error) {
        res.statusCode = 500;
        res.end(`OAuth callback failed: ${error instanceof Error ? error.message : String(error)}`);
        server.close(() => reject(error instanceof Error ? error : new Error(String(error))));
      }
    });

    server.listen(Number(redirect.port || 80), redirect.hostname, () => {
      console.log(`Waiting for OAuth callback on ${GMAIL_OAUTH_REDIRECT_URI}`);
    });
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
