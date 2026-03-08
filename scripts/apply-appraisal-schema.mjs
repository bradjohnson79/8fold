import pg from "pg";

const { Client } = pg;

const DATABASE_URL =
  "postgresql://neondb_owner:npg_6TsucZOWHU2t@ep-purple-dawn-afo04gbg-pooler.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const client = new Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  console.log("Applying 2nd appraisal schema changes...");

  await client.query(`
    CREATE TABLE IF NOT EXISTS v4_job_price_adjustments (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      thread_id TEXT,
      contractor_user_id TEXT NOT NULL,
      job_poster_user_id TEXT NOT NULL,
      support_ticket_id TEXT,
      original_price_cents INTEGER NOT NULL,
      requested_price_cents INTEGER NOT NULL,
      difference_cents INTEGER NOT NULL,
      contractor_scope_details TEXT NOT NULL,
      additional_scope_details TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      secure_token TEXT,
      token_expires_at TIMESTAMP,
      generated_by_admin_id TEXT,
      generated_at TIMESTAMP,
      payment_intent_id TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      approved_at TIMESTAMP
    );
  `);
  console.log("✓ v4_job_price_adjustments table created");

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS v4_job_price_adj_job_contractor_uniq
      ON v4_job_price_adjustments (job_id, contractor_user_id);
    CREATE INDEX IF NOT EXISTS v4_job_price_adj_job_idx
      ON v4_job_price_adjustments (job_id);
    CREATE INDEX IF NOT EXISTS v4_job_price_adj_status_idx
      ON v4_job_price_adjustments (status);
  `);
  console.log("✓ v4_job_price_adjustments indexes created");

  await client.query(`
    ALTER TABLE v4_support_tickets
      ADD COLUMN IF NOT EXISTS adjustment_id TEXT;
  `);
  console.log("✓ v4_support_tickets.adjustment_id column added");

  console.log("\nAll appraisal schema changes applied successfully.");
} catch (err) {
  console.error("Schema migration failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
