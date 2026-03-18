/**
 * LGS Lead Finder Service
 * Discovers contractor websites by city × trade across 4 sources:
 *   1. Google Maps (Places Text Search API)
 *   2. Google Search (scraper)
 *   3. Yelp (scraper)
 *   4. Directories (BBB, Houzz, BuildZoom scrapers)
 *
 * Discovered domains are staged in lead_finder_domains for later dispatch
 * to the existing Domain Discovery pipeline (runBulkDomainDiscoveryAsync).
 */
import pLimit from "p-limit";
import { eq, sql, and, inArray } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  leadFinderCampaigns,
  leadFinderJobs,
  leadFinderDomains,
  contractorLeads,
} from "@/db/schema/directoryEngine";
import { normalizeDomain } from "@/src/utils/normalizeDomain";
import { TRADE_CATEGORIES, tradeToSlug } from "@/src/data/tradeCategories";

// ─── Constants ───────────────────────────────────────────────────────────────

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const BLOCKED_DOMAINS = new Set([
  "facebook.com", "instagram.com", "linkedin.com", "youtube.com",
  "google.com", "google.co", "twitter.com", "x.com", "tiktok.com",
  "yelp.com", "bbb.org", "houzz.com", "thumbtack.com",
  "angieslist.com", "angi.com", "homeadvisor.com", "homeadvisorfb.com",
  "buildzoom.com", "porch.com", "nextdoor.com", "craigslist.org",
  "bing.com", "yahoo.com", "amazon.com", "apple.com", "microsoft.com",
  "wikipedia.org", "wix.com", "squarespace.com", "godaddy.com",
]);

// Per-source concurrency limits
const limitMaps    = pLimit(5);
const limitSearch  = pLimit(3);
const limitYelp    = pLimit(5);
const limitDirs    = pLimit(5);

// ─── fetchHtml ────────────────────────────────────────────────────────────────

async function fetchHtml(
  url: string,
  opts: { userAgent?: string; timeoutMs?: number } = {}
): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 6000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": opts.userAgent ?? CHROME_UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randomDelay = (min: number, max: number) =>
  sleep(min + Math.floor(Math.random() * (max - min)));

// ─── Domain helpers ───────────────────────────────────────────────────────────

function isAllowed(domain: string | null): domain is string {
  if (!domain) return false;
  // Block if exact match or subdomain of a blocked root
  for (const blocked of BLOCKED_DOMAINS) {
    if (domain === blocked || domain.endsWith(`.${blocked}`)) return false;
  }
  return true;
}

function extractDomainsFromHtml(html: string, selfDomain?: string): string[] {
  const domains: string[] = [];
  const hrefRe = /href=["']https?:\/\/([^"'/?#\s]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    const raw = m[1];
    const d = normalizeDomain(`https://${raw}`);
    if (d && isAllowed(d) && d !== selfDomain) domains.push(d);
  }
  return domains;
}

// ─── Source 1: Google Maps ────────────────────────────────────────────────────

interface PlacesResult {
  displayName?: { text?: string };
  websiteUri?: string;
  formattedAddress?: string;
}

async function searchGoogleMaps(
  trade: string,
  city: string,
  state: string,
  maxResults: number,
  opts: {
    centerLat?: number | null;
    centerLng?: number | null;
    radiusKm?: number | null;
    maxApiCalls?: number | null;
  } = {}
): Promise<Array<{ domain: string; businessName: string | null }>> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];

  const keywords = TRADE_CATEGORIES[trade] ?? [trade.toLowerCase()];

  // When lat/lng + radius provided, use locationBias circle (more precise, covers surrounding area)
  // Without lat/lng, fall back to including city/state in the text query
  const hasGeo = opts.centerLat != null && opts.centerLng != null;
  const query = hasGeo ? keywords[0] : `${keywords[0]} ${city} ${state}`;

  const results: Array<{ domain: string; businessName: string | null }> = [];
  let pageToken: string | undefined;
  let apiCallCount = 0;
  const maxCalls = opts.maxApiCalls ?? 500;

  do {
    if (apiCallCount >= maxCalls) break;
    apiCallCount++;

    try {
      const body: Record<string, unknown> = {
        textQuery: query,
        pageSize: Math.min(maxResults - results.length, 20),
      };

      // Geographic radius bias — converts km to meters for Google Places API
      if (hasGeo) {
        body.locationBias = {
          circle: {
            center: { latitude: opts.centerLat, longitude: opts.centerLng },
            radius: (opts.radiusKm ?? 25) * 1000,
          },
        };
      }

      if (pageToken) body.pageToken = pageToken;

      const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          // displayName required — Google rejects requests without it
          "X-Goog-FieldMask": "places.displayName,places.websiteUri,places.formattedAddress,nextPageToken",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) break;
      const json = (await res.json()) as { places?: PlacesResult[]; nextPageToken?: string };
      pageToken = json.nextPageToken;

      for (const place of json.places ?? []) {
        if (!place.websiteUri) continue;
        const domain = normalizeDomain(place.websiteUri);
        if (domain && isAllowed(domain)) {
          results.push({ domain, businessName: place.displayName?.text ?? null });
        }
      }

      await sleep(200); // 5 req/sec max
    } catch {
      break;
    }
  } while (pageToken && results.length < maxResults);

  return results;
}

// ─── Source 2: Google Search ──────────────────────────────────────────────────

async function searchGoogleSearch(
  trade: string,
  city: string,
  state: string
): Promise<string[]> {
  const keywords = TRADE_CATEGORIES[trade] ?? [trade.toLowerCase()];
  const q = encodeURIComponent(`"${keywords[0]}" "${city}" ${state}`);
  const url = `https://www.google.com/search?q=${q}&num=20&hl=en`;

  await randomDelay(300, 800);
  const html = await fetchHtml(url, { userAgent: CHROME_UA });
  if (!html) return [];

  const domains: string[] = [];
  // Google wraps result URLs in /url?q=...&... redirects
  const re = /\/url\?q=(https?:\/\/[^&"'\s]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const decoded = decodeURIComponent(m[1]);
      const d = normalizeDomain(decoded);
      if (d && isAllowed(d)) domains.push(d);
    } catch { /* skip */ }
  }
  return domains;
}

// ─── Source 3: Yelp ───────────────────────────────────────────────────────────

async function searchYelp(
  trade: string,
  city: string,
  state: string
): Promise<string[]> {
  const keywords = TRADE_CATEGORIES[trade] ?? [trade.toLowerCase()];
  const desc = encodeURIComponent(keywords[0]);
  const loc  = encodeURIComponent(`${city}, ${state}`);
  const url  = `https://www.yelp.com/search?find_desc=${desc}&find_loc=${loc}`;

  const html = await fetchHtml(url, { userAgent: CHROME_UA });
  if (!html) return [];

  const domains: string[] = [];

  // Strategy 1: Extract from JSON-LD blocks (most reliable)
  const jsonLdRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = jsonLdRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]) as { url?: string; sameAs?: string[] };
      const candidates = [data.url, ...(data.sameAs ?? [])].filter(Boolean) as string[];
      for (const c of candidates) {
        if (!c.includes("yelp.com")) {
          const d = normalizeDomain(c);
          if (d && isAllowed(d)) domains.push(d);
        }
      }
    } catch { /* skip */ }
  }

  // Strategy 2: External links in business cards
  domains.push(...extractDomainsFromHtml(html, "yelp.com"));

  return [...new Set(domains)];
}

// ─── Source 4: Directories ────────────────────────────────────────────────────

async function searchDirectories(
  trade: string,
  city: string,
  state: string
): Promise<string[]> {
  const keywords = TRADE_CATEGORIES[trade] ?? [trade.toLowerCase()];
  const slug = tradeToSlug(keywords[0]);
  const citySlug = city.toLowerCase().replace(/\s+/g, "-");
  const domains: string[] = [];

  const sources = [
    // BBB
    `https://www.bbb.org/search?find_text=${encodeURIComponent(keywords[0])}&find_loc=${encodeURIComponent(`${city}, ${state}`)}`,
    // Houzz
    `https://www.houzz.com/professionals/${slug}/${citySlug}-ca-us`,
    // BuildZoom
    `https://www.buildzoom.com/contractors/${citySlug}-ca/${slug}`,
  ];

  for (const src of sources) {
    await sleep(200);
    const html = await fetchHtml(src, { userAgent: CHROME_UA });
    if (!html) continue;
    domains.push(...extractDomainsFromHtml(html, new URL(src).hostname.replace(/^www\./, "")));
  }

  return [...new Set(domains)];
}

// ─── Global dedup check ───────────────────────────────────────────────────────

async function filterAlreadyKnownDomains(domains: string[]): Promise<string[]> {
  if (domains.length === 0) return [];

  // Check lead_finder_domains (any campaign)
  const existingFinder = await db
    .select({ domain: leadFinderDomains.domain })
    .from(leadFinderDomains)
    .where(inArray(leadFinderDomains.domain, domains));
  const finderSet = new Set(existingFinder.map((r) => r.domain));

  // Check contractor_leads (already-processed domains)
  const existingLeads = await db
    .select({ website: contractorLeads.website })
    .from(contractorLeads)
    .where(
      and(
        inArray(contractorLeads.website, domains),
        sql`${contractorLeads.website} IS NOT NULL`
      )
    );
  const leadsSet = new Set(existingLeads.map((r) => r.website).filter(Boolean));

  return domains.filter((d) => !finderSet.has(d) && !leadsSet.has(d));
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function runLeadFinderCampaign(campaignId: string): Promise<void> {
  const [campaign] = await db
    .select()
    .from(leadFinderCampaigns)
    .where(eq(leadFinderCampaigns.id, campaignId))
    .limit(1);

  if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);

  const cities   = (campaign.cities  as string[]) ?? [];
  const trades   = (campaign.trades  as string[]) ?? [];
  const sources  = (campaign.sources as string[]) ?? [];
  const maxPerCombo  = campaign.maxResultsPerCombo ?? 25;
  const maxTotal     = campaign.maxDomainsTotal ?? 10000;
  const maxMinutes   = campaign.maxRuntimeMinutes ?? 30;
  const maxApiCalls  = campaign.maxApiCalls ?? 500;
  // Geo radius fields — used for locationBias.circle in Google Maps queries
  const centerLat = campaign.centerLat ?? null;
  const centerLng = campaign.centerLng ?? null;
  const radiusKm  = campaign.radiusKm ?? 25;
  const startTime    = Date.now();

  // Mark running
  await db.update(leadFinderCampaigns)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(leadFinderCampaigns.id, campaignId));

  // Generate all jobs: city × trade × source
  const jobRows: Array<{
    campaignId: string;
    city: string;
    state: string;
    trade: string;
    source: string;
    status: string;
  }> = [];

  for (const city of cities) {
    for (const trade of trades) {
      for (const source of sources) {
        jobRows.push({
          campaignId,
          city,
          state: campaign.state,
          trade,
          source,
          status: "pending",
        });
      }
    }
  }

  if (jobRows.length === 0) {
    await db.update(leadFinderCampaigns)
      .set({ status: "failed", errorMessage: "No jobs generated — check cities, trades, sources.", finishedAt: new Date() })
      .where(eq(leadFinderCampaigns.id, campaignId));
    return;
  }

  const insertedJobs = await db.insert(leadFinderJobs).values(jobRows).returning();
  await db.update(leadFinderCampaigns)
    .set({ jobsTotal: insertedJobs.length })
    .where(eq(leadFinderCampaigns.id, campaignId));

  // Shared cancellation flag — checked every 10 jobs
  let isCancelled = false;
  let jobsProcessed = 0;
  const checkCancellation = async (): Promise<boolean> => {
    if (isCancelled) return true;
    const [row] = await db.select({ status: leadFinderCampaigns.status })
      .from(leadFinderCampaigns)
      .where(eq(leadFinderCampaigns.id, campaignId))
      .limit(1);
    if (row?.status === "cancel_requested") isCancelled = true;
    return isCancelled;
  };

  // Pick concurrency limiter per source
  const getLimiter = (source: string) => {
    if (source === "google_maps")   return limitMaps;
    if (source === "google_search") return limitSearch;
    if (source === "yelp")          return limitYelp;
    return limitDirs;
  };

  await Promise.all(
    insertedJobs.map((job) =>
      getLimiter(job.source)(async () => {
        jobsProcessed++;

        // Cancellation check every 10 jobs
        if (jobsProcessed % 10 === 0 && (await checkCancellation())) return;
        if (isCancelled) return;

        // Safety caps
        const elapsedMinutes = (Date.now() - startTime) / 60000;
        if (elapsedMinutes >= maxMinutes) {
          isCancelled = true;
          return;
        }
        const [currentCampaign] = await db
          .select({ uniqueDomains: leadFinderCampaigns.uniqueDomains })
          .from(leadFinderCampaigns)
          .where(eq(leadFinderCampaigns.id, campaignId))
          .limit(1);
        if ((currentCampaign?.uniqueDomains ?? 0) >= maxTotal) {
          isCancelled = true;
          return;
        }

        // Mark job running
        await db.update(leadFinderJobs)
          .set({ status: "running" })
          .where(eq(leadFinderJobs.id, job.id));

        try {
          // Run the appropriate source scraper
          let rawResults: Array<{ domain: string; businessName: string | null }> = [];

          if (job.source === "google_maps") {
            const found = await searchGoogleMaps(job.trade, job.city, job.state, maxPerCombo, {
              centerLat,
              centerLng,
              radiusKm,
              maxApiCalls,
            });
            rawResults = found;
          } else if (job.source === "google_search") {
            const found = await searchGoogleSearch(job.trade, job.city, job.state);
            rawResults = found.map((d) => ({ domain: d, businessName: null }));
          } else if (job.source === "yelp") {
            const found = await searchYelp(job.trade, job.city, job.state);
            rawResults = found.map((d) => ({ domain: d, businessName: null }));
          } else if (job.source === "directories") {
            const found = await searchDirectories(job.trade, job.city, job.state);
            rawResults = found.map((d) => ({ domain: d, businessName: null }));
          }

          // Deduplicate within this job's result set
          const seenThisJob = new Set<string>();
          const candidates = rawResults
            .filter((r) => {
              if (seenThisJob.has(r.domain)) return false;
              seenThisJob.add(r.domain);
              return true;
            });

          // Global dedup across all campaigns + contractor_leads
          const knownDomains = candidates.map((r) => r.domain);
          const newDomains = await filterAlreadyKnownDomains(knownDomains);
          const newSet = new Set(newDomains);

          const toInsert = candidates.filter((r) => newSet.has(r.domain));

          if (toInsert.length > 0) {
            await db.insert(leadFinderDomains).values(
              toInsert.map((r) => ({
                campaignId,
                jobId: job.id,
                domain: r.domain,
                businessName: r.businessName,
                trade: job.trade,
                city: job.city,
                state: job.state,
                source: job.source,
              }))
            ).onConflictDoNothing();
          }

          // Update job complete
          await db.update(leadFinderJobs)
            .set({ status: "complete", domainsFound: toInsert.length })
            .where(eq(leadFinderJobs.id, job.id));

          // Increment campaign counters
          await db.update(leadFinderCampaigns)
            .set({
              jobsComplete: sql`${leadFinderCampaigns.jobsComplete} + 1`,
              domainsFound: sql`${leadFinderCampaigns.domainsFound} + ${candidates.length}`,
              uniqueDomains: sql`${leadFinderCampaigns.uniqueDomains} + ${toInsert.length}`,
            })
            .where(eq(leadFinderCampaigns.id, campaignId));

        } catch (err) {
          await db.update(leadFinderJobs)
            .set({ status: "failed", errorMessage: err instanceof Error ? err.message : "unknown" })
            .where(eq(leadFinderJobs.id, job.id));
          await db.update(leadFinderCampaigns)
            .set({ jobsComplete: sql`${leadFinderCampaigns.jobsComplete} + 1` })
            .where(eq(leadFinderCampaigns.id, campaignId));
        }
      })
    )
  );

  // Finalize
  const finishedAt = new Date();
  const elapsedSeconds = Math.round((finishedAt.getTime() - startTime) / 1000);

  const [finalCampaign] = await db
    .select({ uniqueDomains: leadFinderCampaigns.uniqueDomains })
    .from(leadFinderCampaigns)
    .where(eq(leadFinderCampaigns.id, campaignId))
    .limit(1);
  const domainsPerSecond = elapsedSeconds > 0
    ? ((finalCampaign?.uniqueDomains ?? 0) / elapsedSeconds).toFixed(2)
    : "0";

  if (isCancelled) {
    await db.update(leadFinderCampaigns)
      .set({ status: "cancelled", finishedAt, elapsedSeconds, domainsPerSecond })
      .where(eq(leadFinderCampaigns.id, campaignId));
    console.log(`[LeadFinder] Campaign ${campaignId} cancelled.`);
  } else {
    await db.update(leadFinderCampaigns)
      .set({ status: "complete", finishedAt, elapsedSeconds, domainsPerSecond })
      .where(eq(leadFinderCampaigns.id, campaignId));
    console.log(`[LeadFinder] Campaign ${campaignId} complete. Domains: ${finalCampaign?.uniqueDomains ?? 0}`);
  }
}
