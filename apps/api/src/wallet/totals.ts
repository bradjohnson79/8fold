import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { ledgerEntries } from "../../db/schema/ledgerEntry";

type Bucket = "PENDING" | "AVAILABLE" | "PAID" | "HELD";

export type WalletTotals = Record<Bucket, number>;

function add(map: WalletTotals, bucket: Bucket, delta: number) {
  map[bucket] = (map[bucket] ?? 0) + delta;
}

export async function getWalletTotals(userId: string): Promise<WalletTotals> {
  const rows = await db
    .select({
      bucket: ledgerEntries.bucket,
      direction: ledgerEntries.direction,
      sumAmountCents: sql<number>`sum(${ledgerEntries.amountCents})`,
    })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.userId, userId)))
    .groupBy(ledgerEntries.bucket, ledgerEntries.direction);

  const totals: WalletTotals = { PENDING: 0, AVAILABLE: 0, PAID: 0, HELD: 0 };
  for (const r of rows) {
    const sum = Number((r as any).sumAmountCents ?? 0);
    const signed = String(r.direction) === "CREDIT" ? sum : -sum;
    add(totals, String(r.bucket) as Bucket, signed);
  }
  return totals;
}

