import pg from "pg";

const { Client } = pg;

const DATABASE_URL =
  "postgresql://neondb_owner:npg_6TsucZOWHU2t@ep-purple-dawn-afo04gbg-pooler.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const client = new Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  console.log("Applying support schema changes...");

  // First detect schema name
  const schemaRes = await client.query(`SELECT current_schema()`);
  const schema = schemaRes.rows[0].current_schema;
  console.log("Using schema:", schema);

  // Add new columns to v4_support_tickets (snake_case, matching Drizzle schema)
  await client.query(`
    ALTER TABLE v4_support_tickets
      ADD COLUMN IF NOT EXISTS ticket_type TEXT,
      ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'NORMAL',
      ADD COLUMN IF NOT EXISTS job_id TEXT,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
  `);
  console.log("✓ v4_support_tickets columns added");

  // Add indexes
  await client.query(`
    CREATE INDEX IF NOT EXISTS v4_support_tickets_status_idx
      ON v4_support_tickets (status);
  `);
  console.log("✓ v4_support_tickets status index created");

  // Create v4_support_messages table
  await client.query(`
    CREATE TABLE IF NOT EXISTS v4_support_messages (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL REFERENCES v4_support_tickets(id) ON DELETE CASCADE,
      sender_user_id TEXT NOT NULL,
      sender_role TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  console.log("✓ v4_support_messages table created");

  await client.query(`
    CREATE INDEX IF NOT EXISTS v4_support_messages_ticket_idx
      ON v4_support_messages (ticket_id);
    CREATE INDEX IF NOT EXISTS v4_support_messages_sender_idx
      ON v4_support_messages (sender_user_id);
  `);
  console.log("✓ v4_support_messages indexes created");

  console.log("\nAll schema changes applied successfully.");
} catch (err) {
  console.error("Schema migration failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
