import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { createTestDb } from "../testUtils/testDb";
import { ledgerEntries, users } from "../../db/schema";

describe("ledger immutability", () => {
  const { db, pool } = createTestDb();

  beforeAll(async () => {
    // pool is lazy; connect once so failures surface early
    const client = await pool.connect();
    client.release();
  });
  afterAll(async () => {
    await pool.end();
  });

  test("LedgerEntry cannot be updated or deleted (DB enforced)", async () => {
    const userId = randomUUID();
    await db.insert(users).values({ id: userId, authUserId: `test:user:${Date.now()}`, role: "USER" as any });

    const entryId = randomUUID();
    await db.insert(ledgerEntries).values({
      id: entryId,
      userId,
      type: "ADJUSTMENT",
      direction: "CREDIT",
      bucket: "AVAILABLE",
      amountCents: 123,
      memo: "test",
    });

    await expect(
      db.update(ledgerEntries).set({ memo: "nope" }).where(eq(ledgerEntries.id, entryId))
    ).rejects.toBeTruthy();

    await expect(db.delete(ledgerEntries).where(eq(ledgerEntries.id, entryId))).rejects.toBeTruthy();
  });
});

