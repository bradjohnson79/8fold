import { db } from "@/db/drizzle";
import { seoIndexingLog } from "@/db/schema/seoIndexingLog";
import { getGoogleAccessToken, getGoogleServiceAccount } from "./googleAuthService";
import { getSeoSettings } from "./seoSettingsService";

export type IndexingEngine = "google" | "indexnow";
export type IndexingTrigger = "manual" | string; // domain event type or "manual"

export interface PingResult {
  engine: IndexingEngine;
  url: string;
  status: "success" | "error";
  responseCode?: number;
  errorMessage?: string;
}

async function writeLog(result: PingResult & { triggeredBy: string }): Promise<void> {
  await db.insert(seoIndexingLog).values({
    id: crypto.randomUUID(),
    url: result.url,
    engine: result.engine,
    status: result.status,
    responseCode: result.responseCode ?? null,
    errorMessage: result.errorMessage ?? null,
    triggeredBy: result.triggeredBy,
    createdAt: new Date(),
  });
}

export async function pingIndexNow(url: string, triggeredBy: IndexingTrigger = "manual"): Promise<PingResult> {
  const settings = await getSeoSettings();
  const key = settings?.indexNowKey ?? process.env.INDEX_NOW_KEY;

  if (!key) {
    const result: PingResult = { engine: "indexnow", url, status: "error", errorMessage: "INDEX_NOW_KEY not configured" };
    await writeLog({ ...result, triggeredBy }).catch(() => undefined);
    return result;
  }

  try {
    const resp = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: new URL(url).hostname,
        key,
        keyLocation: `${new URL(url).origin}/${key}.txt`,
        urlList: [url],
      }),
    });

    const result: PingResult = {
      engine: "indexnow",
      url,
      status: resp.ok || resp.status === 202 ? "success" : "error",
      responseCode: resp.status,
    };
    await writeLog({ ...result, triggeredBy }).catch(() => undefined);
    return result;
  } catch (e) {
    const result: PingResult = {
      engine: "indexnow",
      url,
      status: "error",
      errorMessage: e instanceof Error ? e.message : String(e),
    };
    await writeLog({ ...result, triggeredBy }).catch(() => undefined);
    return result;
  }
}

const GOOGLE_INDEXING_SCOPE = "https://www.googleapis.com/auth/indexing";

export async function pingGoogle(url: string, triggeredBy: IndexingTrigger = "manual"): Promise<PingResult> {
  const serviceAccount = getGoogleServiceAccount();

  if (!serviceAccount) {
    const result: PingResult = {
      engine: "google",
      url,
      status: "error",
      errorMessage:
        "Google Indexing not configured. Set GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON (base64) or GOOGLE_INDEXING_CLIENT_EMAIL + GOOGLE_INDEXING_PRIVATE_KEY",
    };
    await writeLog({ ...result, triggeredBy }).catch(() => undefined);
    return result;
  }

  try {
    const token = await getGoogleAccessToken(serviceAccount, GOOGLE_INDEXING_SCOPE);

    const resp = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url, type: "URL_UPDATED" }),
    });

    const result: PingResult = {
      engine: "google",
      url,
      status: resp.ok ? "success" : "error",
      responseCode: resp.status,
    };
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      result.errorMessage = body.slice(0, 500);
    }
    await writeLog({ ...result, triggeredBy }).catch(() => undefined);
    return result;
  } catch (e) {
    const result: PingResult = {
      engine: "google",
      url,
      status: "error",
      errorMessage: e instanceof Error ? e.message : String(e),
    };
    await writeLog({ ...result, triggeredBy }).catch(() => undefined);
    return result;
  }
}

export async function pingUrl(url: string, triggeredBy: IndexingTrigger = "manual"): Promise<PingResult[]> {
  const [google, indexNow] = await Promise.allSettled([
    pingGoogle(url, triggeredBy),
    pingIndexNow(url, triggeredBy),
  ]);

  return [
    google.status === "fulfilled" ? google.value : { engine: "google" as const, url, status: "error" as const, errorMessage: "Promise rejected" },
    indexNow.status === "fulfilled" ? indexNow.value : { engine: "indexnow" as const, url, status: "error" as const, errorMessage: "Promise rejected" },
  ];
}

export async function getIndexingLogs(limit = 50) {
  const { desc } = await import("drizzle-orm");
  return db
    .select()
    .from(seoIndexingLog)
    .orderBy(desc(seoIndexingLog.createdAt))
    .limit(limit);
}
