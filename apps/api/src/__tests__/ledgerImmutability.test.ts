import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";

const hasDatabaseUrl = Boolean(String(process.env.DATABASE_URL ?? "").trim());
const suite = hasDatabaseUrl ? describe : describe.skip;

suite("ledger immutability", () => {
  let db: unknown;
  let pool: { connect: () => Promise<{ release: () => void }>; end: () => Promise<void> } | null = null;
  let ledgerEntries: any;
  let users: any;

  beforeAll(async () => {
    if (!hasDatabaseUrl) return;
    // Import lazily so running `pnpm test` does not hard-require a DB.
    // This suite is only meaningful when pointed at a real Postgres instance.
    const { createTestDb } = await import("../testUtils/testDb");
    const out = createTestDb();
    db = out.db;
    pool = out.pool as any;

    // Schema modules read DATABASE_URL to determine schema; only import when configured.
    const schema = await import("../../db/schema");
    ledgerEntries = (schema as any).ledgerEntries;
    users = (schema as any).users;

    // pool is lazy; connect once so failures surface early
    const client = await pool!.connect();
    client.release();
  });
  afterAll(async () => {
    if (!pool) return;
    await pool.end();
  });

  test("LedgerEntry cannot be updated or deleted (DB enforced)", async () => {
    const userId = randomUUID();
    await (db as any)
      .insert(users!)
      .values({ id: userId, clerkUserId: `test:user:${Date.now()}`, role: "JOB_POSTER" as any } as any);

    const entryId = randomUUID();
    await (db as any).insert(ledgerEntries!).values({
      id: entryId,
      userId,
      type: "ADJUSTMENT",
      direction: "CREDIT",
      bucket: "AVAILABLE",
      amountCents: 123,
      memo: "test",
    });

    await expect(
      (db as any).update(ledgerEntries!).set({ memo: "nope" }).where(eq(ledgerEntries.id, entryId))
    ).rejects.toBeTruthy();

    await expect((db as any).delete(ledgerEntries!).where(eq(ledgerEntries.id, entryId))).rejects.toBeTruthy();
  });
});

