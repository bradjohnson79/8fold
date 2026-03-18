import path from "node:path";
import dotenv from "dotenv";
import { eq, sql } from "drizzle-orm";
import { senderPool } from "../db/schema/directoryEngine";

dotenv.config({
  path: process.env.DOTENV_CONFIG_PATH || path.join(process.cwd(), "apps/api/.env.local"),
});

type EnvSenderTokenPair = {
  senderEmail: string;
  refreshToken: string;
};

function getEnvSenderTokenPairs(): EnvSenderTokenPair[] {
  const pairs = [
    {
      senderEmail: process.env.GMAIL_SENDER_1,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN_1,
    },
    {
      senderEmail: process.env.GMAIL_SENDER_2,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN_2,
    },
    {
      senderEmail: process.env.GMAIL_SENDER_3,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN_3,
    },
    {
      senderEmail: process.env.GMAIL_SENDER_4,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN_4,
    },
  ];

  return pairs
    .filter((pair): pair is { senderEmail: string; refreshToken: string } =>
      Boolean(pair.senderEmail?.trim() && pair.refreshToken?.trim())
    )
    .map((pair) => ({
      senderEmail: pair.senderEmail.trim().toLowerCase(),
      refreshToken: pair.refreshToken.trim(),
    }));
}

async function main() {
  const { db } = await import("../db/drizzle");

  await db.execute(sql`
    alter table "directory_engine"."sender_pool"
      add column if not exists "gmail_refresh_token" text,
      add column if not exists "gmail_access_token" text,
      add column if not exists "gmail_token_expires_at" timestamp,
      add column if not exists "gmail_connected" boolean not null default false;
  `);

  const envPairs = getEnvSenderTokenPairs();
  if (envPairs.length === 0) {
    console.log("[LGS Gmail] no env sender/token pairs found; schema ensured only");
    return;
  }

  let migrated = 0;
  let missingSenders = 0;

  for (const pair of envPairs) {
    const [updated] = await db
      .update(senderPool)
      .set({
        gmailRefreshToken: pair.refreshToken,
        gmailConnected: true,
        updatedAt: new Date(),
      })
      .where(eq(senderPool.senderEmail, pair.senderEmail))
      .returning({
        senderEmail: senderPool.senderEmail,
      });

    if (updated) {
      migrated += 1;
      console.log(`[LGS Gmail] migrated token for ${updated.senderEmail}`);
    } else {
      missingSenders += 1;
      console.warn(`[LGS Gmail] sender_pool row not found for ${pair.senderEmail}`);
    }
  }

  console.log(
    `[LGS Gmail] sender token migration complete: migrated=${migrated} missing_sender_rows=${missingSenders}`
  );
}

main().catch((error) => {
  console.error("[LGS Gmail] sender token migration failed:", error);
  process.exit(1);
});
