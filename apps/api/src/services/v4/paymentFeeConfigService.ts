import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { v4PaymentFeeConfig } from "@/db/schema/v4PaymentFeeConfig";

type TxLike = {
  select: typeof db.select;
  insert: typeof db.insert;
};

export type PaymentMethodConfig = "card";

export type PaymentFeeConfig = {
  percentBps: number;
  fixedCents: number;
};

const DEFAULT_CARD_CONFIG: PaymentFeeConfig = {
  percentBps: 290,
  fixedCents: 30,
};

async function ensureDefaultCardConfig(executor: TxLike | typeof db): Promise<void> {
  await executor
    .insert(v4PaymentFeeConfig)
    .values({
      id: "default-card",
      paymentMethod: "card",
      percentBps: DEFAULT_CARD_CONFIG.percentBps,
      fixedCents: DEFAULT_CARD_CONFIG.fixedCents,
    })
    .onConflictDoNothing();
}

function normalizeConfig(row: { percentBps: number; fixedCents: number } | undefined): PaymentFeeConfig {
  const percentBps = Math.max(0, Math.trunc(Number(row?.percentBps ?? DEFAULT_CARD_CONFIG.percentBps)));
  const fixedCents = Math.max(0, Math.trunc(Number(row?.fixedCents ?? DEFAULT_CARD_CONFIG.fixedCents)));
  return { percentBps, fixedCents };
}

export async function getOrCreateDefaultCardConfig(tx?: TxLike): Promise<PaymentFeeConfig> {
  return getFeeConfig("card", tx);
}

export async function getFeeConfig(paymentMethod: PaymentMethodConfig, tx?: TxLike): Promise<PaymentFeeConfig> {
  const executor = tx ?? db;
  const method = String(paymentMethod ?? "card").trim().toLowerCase() as PaymentMethodConfig;

  const rows = await executor
    .select({
      percentBps: v4PaymentFeeConfig.percentBps,
      fixedCents: v4PaymentFeeConfig.fixedCents,
    })
    .from(v4PaymentFeeConfig)
    .where(eq(v4PaymentFeeConfig.paymentMethod, method))
    .limit(1);

  if (rows[0]) return normalizeConfig(rows[0]);

  if (method === "card") {
    await ensureDefaultCardConfig(executor);
    const fallbackRows = await executor
      .select({
        percentBps: v4PaymentFeeConfig.percentBps,
        fixedCents: v4PaymentFeeConfig.fixedCents,
      })
      .from(v4PaymentFeeConfig)
      .where(eq(v4PaymentFeeConfig.paymentMethod, "card"))
      .limit(1);
    return normalizeConfig(fallbackRows[0]);
  }

  return normalizeConfig(undefined);
}
