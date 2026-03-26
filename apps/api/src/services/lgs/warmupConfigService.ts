import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { lgsWorkerHealth } from "@/db/schema/directoryEngine";

const WARMUP_WORKER_NAME = "warmup";

type WarmupConfig = {
  warmup_enabled?: boolean;
  [key: string]: unknown;
};

function readConfigObject(value: unknown): WarmupConfig {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as WarmupConfig;
  }
  return {};
}

export async function getWarmupEnabled(): Promise<boolean> {
  const [row] = await db
    .select({ configCheckResult: lgsWorkerHealth.configCheckResult })
    .from(lgsWorkerHealth)
    .where(eq(lgsWorkerHealth.workerName, WARMUP_WORKER_NAME))
    .limit(1);

  const config = readConfigObject(row?.configCheckResult);
  return config.warmup_enabled !== false;
}

export async function setWarmupEnabled(enabled: boolean): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(lgsWorkerHealth)
    .where(eq(lgsWorkerHealth.workerName, WARMUP_WORKER_NAME))
    .limit(1);

  const nextConfig = {
    ...readConfigObject(existing?.configCheckResult),
    warmup_enabled: enabled,
  };

  if (existing) {
    await db
      .update(lgsWorkerHealth)
      .set({
        configCheckResult: nextConfig,
        lastHeartbeatAt: existing.lastHeartbeatAt ?? new Date(),
      })
      .where(eq(lgsWorkerHealth.workerName, WARMUP_WORKER_NAME));
  } else {
    await db.insert(lgsWorkerHealth).values({
      workerName: WARMUP_WORKER_NAME,
      configCheckResult: nextConfig,
      lastHeartbeatAt: new Date(),
    });
  }

  return enabled;
}
