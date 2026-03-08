import pg from "pg";
import { randomUUID } from "crypto";

const { Client } = pg;

const DATABASE_URL =
  "postgresql://neondb_owner:npg_6TsucZOWHU2t@ep-purple-dawn-afo04gbg-pooler.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const client = new Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  console.log("Applying frontpage ticker schema...");

  await client.query(`
    CREATE TABLE IF NOT EXISTS v4_frontpage_ticker_messages (
      id TEXT PRIMARY KEY,
      message TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      display_order INTEGER NOT NULL DEFAULT 1,
      interval_seconds INTEGER NOT NULL DEFAULT 6,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  console.log("✓ v4_frontpage_ticker_messages table created");

  const { rowCount } = await client.query("SELECT 1 FROM v4_frontpage_ticker_messages LIMIT 1");
  if (!rowCount) {
    const seeds = [
      { order: 1, message: "8Fold is currently in Beta — thank you for being an early user!" },
      { order: 2, message: "Need help? Visit our Contact page to reach the 8Fold team." },
      { order: 3, message: "Contractors, Routers, and Job Posters — welcome to the future of local work." },
    ];

    for (const s of seeds) {
      await client.query(
        `INSERT INTO v4_frontpage_ticker_messages (id, message, is_active, display_order, interval_seconds)
         VALUES ($1, $2, TRUE, $3, 6)`,
        [randomUUID(), s.message, s.order]
      );
    }
    console.log("✓ Seeded 3 default ticker messages");
  } else {
    console.log("⦿ Ticker messages already exist, skipping seed");
  }

  console.log("\nAll ticker schema changes applied successfully.");
} catch (err) {
  console.error("Schema migration failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
