import { getSeoSettings } from "./seoSettingsService";

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Submits a batch of absolute URLs to IndexNow.
 * Reads indexNowKey and canonicalDomain from seo_settings — never from env or browser.
 * Batches into groups of 100 (IndexNow maximum per request).
 * Logs responses for observability.
 */
export async function submitIndexNow(urls: string[]): Promise<void> {
  if (!urls.length) return;

  const settings = await getSeoSettings();
  if (!settings?.indexNowKey || !settings?.canonicalDomain) {
    console.log("[IndexNow] Skipping — indexNowKey or canonicalDomain not configured");
    return;
  }

  for (const batch of chunk(urls, 100)) {
    try {
      const res = await fetch("https://api.indexnow.org/indexnow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: settings.canonicalDomain,
          key: settings.indexNowKey,
          urlList: batch,
        }),
      });
      console.log(`[IndexNow] Submitted ${batch.length} URL(s) → HTTP ${res.status}`);
    } catch (error) {
      console.error("[IndexNow] Submission failed:", error);
    }
  }
}
