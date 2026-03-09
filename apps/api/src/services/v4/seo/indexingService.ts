import { randomUUID } from "crypto";
import { db } from "@/db/drizzle";
import { seoIndexingLog } from "@/db/schema/seoIndexingLog";
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
    id: randomUUID(),
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

export async function pingGoogle(url: string, triggeredBy: IndexingTrigger = "manual"): Promise<PingResult> {
  const serviceAccountJson = process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    const result: PingResult = {
      engine: "google",
      url,
      status: "error",
      errorMessage: "GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON not configured",
    };
    await writeLog({ ...result, triggeredBy }).catch(() => undefined);
    return result;
  }

  try {
    const serviceAccount = JSON.parse(
      Buffer.from(serviceAccountJson, "base64").toString("utf-8"),
    );

    // Obtain an access token using the service account JWT flow
    const token = await getGoogleAccessToken(serviceAccount);

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

async function getGoogleAccessToken(serviceAccount: Record<string, string>): Promise<string> {
  const { createSign } = await import("crypto");

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: serviceAccount["client_email"],
      scope: "https://www.googleapis.com/auth/indexing",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");

  const signingInput = `${header}.${payload}`;
  const sign = createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(serviceAccount["private_key"], "base64url");
  const jwt = `${signingInput}.${signature}`;

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenResp.ok) {
    throw new Error(`Failed to get Google access token: ${tokenResp.status}`);
  }
  const data = (await tokenResp.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("No access_token in Google token response");
  return data.access_token;
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
