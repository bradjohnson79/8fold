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
  jobPosterLeads,
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

const GOOGLE_PLACE_TYPE_BY_TRADE: Record<string, string> = {
  "General Contractors": "general_contractor",
  "Electricians": "electrician",
  "Plumbing": "plumber",
  "Roofing": "roofing_contractor",
  "Painting": "painter",
};

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

type LeadFinderBusinessRecord = {
  domain: string | null;
  businessName: string | null;
  websiteUrl: string | null;
  formattedAddress: string | null;
  phone: string | null;
  placeId: string | null;
};

interface LegacyGoogleTextSearchPlace {
  name?: string;
  formatted_address?: string;
  place_id?: string;
  types?: string[];
}

interface LegacyGoogleTextSearchResponse {
  status?: string;
  error_message?: string;
  results?: LegacyGoogleTextSearchPlace[];
  next_page_token?: string;
}

interface LegacyGooglePlaceDetailsResponse {
  status?: string;
  error_message?: string;
  result?: {
    name?: string;
    formatted_address?: string;
    website?: string;
    formatted_phone_number?: string;
    place_id?: string;
  };
}

function sanitizeGoogleUrl(url: URL): string {
  const safe = new URL(url.toString());
  if (safe.searchParams.has("key")) safe.searchParams.set("key", "[REDACTED]");
  return safe.toString();
}

function getGoogleMapsQuery(trade: string, city: string, state: string): string {
  const keywords = TRADE_CATEGORIES[trade] ?? [trade.toLowerCase()];
  const primaryKeyword = keywords[0] ?? trade.toLowerCase();
  return `${primaryKeyword} ${city} ${state}`.replace(/\s+/g, " ").trim();
}

function getDomainCount(rows: LeadFinderBusinessRecord[]): number {
  return rows.reduce((count, row) => count + (row.domain ? 1 : 0), 0);
}

async function getGooglePlaceDetails(
  apiKey: string,
  place: LegacyGoogleTextSearchPlace
): Promise<LeadFinderBusinessRecord> {
  const detailsUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  detailsUrl.searchParams.set("place_id", place.place_id ?? "");
  detailsUrl.searchParams.set("fields", "name,formatted_address,website,formatted_phone_number,place_id");
  detailsUrl.searchParams.set("key", apiKey);

  const res = await fetch(detailsUrl);
  const json = (await res.json().catch(() => ({}))) as LegacyGooglePlaceDetailsResponse;
  const result = json.result;
  const websiteUrl = result?.website?.trim() || null;
  const normalizedDomain = websiteUrl ? normalizeDomain(websiteUrl) : null;
  const domain = normalizedDomain && isAllowed(normalizedDomain) ? normalizedDomain : null;

  return {
    domain,
    businessName: result?.name?.trim() || place.name?.trim() || null,
    websiteUrl,
    formattedAddress: result?.formatted_address?.trim() || place.formatted_address?.trim() || null,
    phone: result?.formatted_phone_number?.trim() || null,
    placeId: result?.place_id ?? place.place_id ?? null,
  };
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
) : Promise<LeadFinderBusinessRecord[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];

  const keywords = TRADE_CATEGORIES[trade] ?? [trade.toLowerCase()];
  const queries = [...new Set(keywords.map((keyword) => `${keyword} ${city} ${state}`.replace(/\s+/g, " ").trim()))];
  const hasGeo = opts.centerLat != null && opts.centerLng != null;
  const placeType = GOOGLE_PLACE_TYPE_BY_TRADE[trade] ?? null;

  const results: LeadFinderBusinessRecord[] = [];
  let apiCallCount = 0;
  const maxCalls = opts.maxApiCalls ?? 500;
  const detailsLimiter = pLimit(5);

  for (const query of queries) {
    let pageToken: string | undefined;
    let pageTokenRetryCount = 0;

    do {
      if (apiCallCount >= maxCalls || getDomainCount(results) >= maxResults) break;
      apiCallCount++;

      try {
        const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
        url.searchParams.set("key", apiKey);
        if (pageToken) {
          url.searchParams.set("pagetoken", pageToken);
        } else {
          url.searchParams.set("query", query);
          url.searchParams.set("region", "us");
          url.searchParams.set("language", "en");
          if (placeType) url.searchParams.set("type", placeType);
          if (hasGeo) {
            url.searchParams.set("location", `${opts.centerLat},${opts.centerLng}`);
            url.searchParams.set("radius", String((opts.radiusKm ?? 25) * 1000));
          }
        }

        console.log("[Lead Finder] Query sent", {
          source: "google_maps",
          query,
          type: placeType,
          location: hasGeo ? { latitude: opts.centerLat, longitude: opts.centerLng } : null,
          radius_km: hasGeo ? (opts.radiusKm ?? 25) : null,
          request_url: sanitizeGoogleUrl(url),
          api_call_count: apiCallCount,
        });

        const res = await fetch(url);
        const json = (await res.json().catch(() => ({}))) as LegacyGoogleTextSearchResponse;

        if (pageToken && json.status === "INVALID_REQUEST" && pageTokenRetryCount < 3) {
          pageTokenRetryCount++;
          await sleep(2000);
          continue;
        }
        pageTokenRetryCount = 0;

        if (!res.ok || (json.status && !["OK", "ZERO_RESULTS"].includes(json.status))) {
          console.error("[Lead Finder] Results received", {
            source: "google_maps",
            http_status: res.status,
            api_status: json.status ?? null,
            error_message: json.error_message ?? null,
            sample: (json.results ?? []).slice(0, 5).map((place) => ({
              name: place.name ?? null,
              formatted_address: place.formatted_address ?? null,
              place_id: place.place_id ?? null,
            })),
          });
          break;
        }

        const rawPlaces = json.results ?? [];
        pageToken = json.next_page_token;

        console.log("[Lead Finder] Results received", {
          source: "google_maps",
          http_status: res.status,
          api_status: json.status ?? null,
          count: rawPlaces.length,
          sample: rawPlaces.slice(0, 5).map((place) => ({
            name: place.name ?? null,
            formatted_address: place.formatted_address ?? null,
            place_id: place.place_id ?? null,
            website: null,
          })),
        });

        if (rawPlaces.length === 0) break;

        const detailedPlaces = (
          await Promise.all(
            rawPlaces.map((place) =>
              detailsLimiter(async () => {
                if (!place.place_id || apiCallCount >= maxCalls) return null;
                apiCallCount++;
                try {
                  return await getGooglePlaceDetails(apiKey, place);
                } catch (err) {
                  console.error("[Lead Finder] Google Place Details failed", {
                    place_id: place.place_id,
                    error: err instanceof Error ? err.message : String(err),
                  });
                  return null;
                }
              })
            )
          )
        ).filter((place): place is LeadFinderBusinessRecord => Boolean(place));

        console.log("[Lead Finder] Domains extracted", {
          source: "google_maps",
          domains_found: detailedPlaces.filter((place) => place.domain).length,
          sample: detailedPlaces.slice(0, 5).map((place) => ({
            place_id: place.placeId,
            business_name: place.businessName,
            website_url: place.websiteUrl,
            domain: place.domain,
            phone: place.phone,
            formatted_address: place.formattedAddress,
          })),
        });

        results.push(...detailedPlaces);

        if (pageToken && getDomainCount(results) < maxResults) {
          await sleep(2500);
        }
      } catch (err) {
        console.error("[Lead Finder] Google Maps search failed", err);
        break;
      }
    } while (pageToken && getDomainCount(results) < maxResults);

    if (getDomainCount(results) >= maxResults) break;
  }

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

async function filterAlreadyKnownDomains(
  domains: string[],
  campaignType: "contractor" | "jobs"
): Promise<string[]> {
  if (domains.length === 0) return [];

  // Check lead_finder_domains (any campaign)
  const existingFinder = await db
    .select({ domain: leadFinderDomains.domain })
    .from(leadFinderDomains)
    .where(
      and(
        inArray(leadFinderDomains.domain, domains),
        eq(leadFinderDomains.campaignType, campaignType)
      )
    );
  const finderSet = new Set(existingFinder.map((r) => r.domain));

  const existingLeads = campaignType === "jobs"
    ? await db
        .select({ website: jobPosterLeads.website })
        .from(jobPosterLeads)
        .where(
          and(
            inArray(jobPosterLeads.website, domains),
            sql`${jobPosterLeads.website} IS NOT NULL`
          )
        )
    : await db
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

  const campaignType = (campaign.campaignType ?? "contractor") as "contractor" | "jobs";
  const cities   = (campaign.cities  as string[]) ?? [];
  const trades   = (campaign.trades  as string[]) ?? [];
  const categories = (campaign.categories as string[]) ?? [];
  const searchUnits = campaignType === "jobs" ? categories : trades;
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
    trade: string | null;
    category: string | null;
    source: string;
    status: string;
  }> = [];

  for (const city of cities) {
    for (const unit of searchUnits) {
      for (const source of sources) {
        jobRows.push({
          campaignId,
          city,
          state: campaign.state,
          trade: campaignType === "contractor" ? unit : null,
          category: campaignType === "jobs" ? unit : null,
          source,
          status: "pending",
        });
      }
    }
  }

  if (jobRows.length === 0) {
    await db.update(leadFinderCampaigns)
      .set({ status: "failed", errorMessage: "No jobs generated — check cities/categories and sources.", finishedAt: new Date() })
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
          let rawResults: LeadFinderBusinessRecord[] = [];

          const searchLabel = job.category ?? job.trade ?? "";
          if (job.source === "google_maps") {
            const found = await searchGoogleMaps(searchLabel, job.city, job.state, maxPerCombo, {
              centerLat,
              centerLng,
              radiusKm,
              maxApiCalls,
            });
            rawResults = found;
          } else if (job.source === "google_search") {
            const found = await searchGoogleSearch(searchLabel, job.city, job.state);
            rawResults = found.map((d) => ({
              domain: d,
              businessName: null,
              websiteUrl: d ? `https://${d}` : null,
              formattedAddress: null,
              phone: null,
              placeId: null,
            }));
          } else if (job.source === "yelp") {
            const found = await searchYelp(searchLabel, job.city, job.state);
            rawResults = found.map((d) => ({
              domain: d,
              businessName: null,
              websiteUrl: d ? `https://${d}` : null,
              formattedAddress: null,
              phone: null,
              placeId: null,
            }));
          } else if (job.source === "directories") {
            const found = await searchDirectories(searchLabel, job.city, job.state);
            rawResults = found.map((d) => ({
              domain: d,
              businessName: null,
              websiteUrl: d ? `https://${d}` : null,
              formattedAddress: null,
              phone: null,
              placeId: null,
            }));
          }

          // Deduplicate within this job's result set
          const seenThisJob = new Set<string>();
          const candidates = rawResults
            .filter((r) => {
              const dedupeKey = r.domain ?? r.placeId ?? `${r.businessName ?? ""}|${r.formattedAddress ?? ""}`.toLowerCase();
              if (!dedupeKey) return false;
              if (seenThisJob.has(dedupeKey)) return false;
              seenThisJob.add(dedupeKey);
              return true;
            });

          // Global dedup across all campaigns + contractor_leads
          const domainCandidates = candidates.filter(
            (r): r is LeadFinderBusinessRecord & { domain: string } => Boolean(r.domain)
          );
          const knownDomains = domainCandidates.map((r) => r.domain);
          const newDomains = await filterAlreadyKnownDomains(knownDomains, campaignType);
          const newSet = new Set(newDomains);

          const toInsert = candidates.filter((r) => !r.domain || newSet.has(r.domain));
          const insertedDomainCount = toInsert.filter((r) => r.domain).length;

          if (toInsert.length > 0) {
            await db.insert(leadFinderDomains).values(
              toInsert.map((r) => ({
                campaignId,
                jobId: job.id,
                domain: r.domain,
                businessName: r.businessName,
                campaignType,
                trade: job.trade,
                category: job.category,
                city: job.city,
                state: job.state,
                source: job.source,
                websiteUrl: r.websiteUrl,
                formattedAddress: r.formattedAddress,
                phone: r.phone,
                placeId: r.placeId,
              }))
            ).onConflictDoNothing();
          }

          console.log("[Lead Finder] Inserted count", {
            campaign_id: campaignId,
            job_id: job.id,
            source: job.source,
            inserted_rows: toInsert.length,
            inserted_domains: insertedDomainCount,
            fallback_businesses_without_domain: toInsert.filter((r) => !r.domain).length,
            sample: toInsert.slice(0, 5).map((r) => ({
              place_id: r.placeId,
              business_name: r.businessName,
              domain: r.domain,
              website_url: r.websiteUrl,
              phone: r.phone,
              formatted_address: r.formattedAddress,
            })),
          });

          // Update job complete
          await db.update(leadFinderJobs)
            .set({ status: "complete", domainsFound: insertedDomainCount })
            .where(eq(leadFinderJobs.id, job.id));

          // Increment campaign counters
          await db.update(leadFinderCampaigns)
            .set({
              jobsComplete: sql`${leadFinderCampaigns.jobsComplete} + 1`,
              domainsFound: sql`${leadFinderCampaigns.domainsFound} + ${domainCandidates.length}`,
              uniqueDomains: sql`${leadFinderCampaigns.uniqueDomains} + ${insertedDomainCount}`,
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
    console.log(`[Lead Finder] Campaign ${campaignId} cancelled.`);
  } else {
    await db.update(leadFinderCampaigns)
      .set({ status: "complete", finishedAt, elapsedSeconds, domainsPerSecond })
      .where(eq(leadFinderCampaigns.id, campaignId));
    console.log(`[Lead Finder] Campaign ${campaignId} complete. Domains: ${finalCampaign?.uniqueDomains ?? 0}`);
  }
}
