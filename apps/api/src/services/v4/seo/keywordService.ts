import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { sql } from "drizzle-orm";

const TRADE_SERVICES = [
  "plumbing", "electrical", "hvac", "appliance repair", "handyman",
  "painting", "carpentry", "drywall", "roofing", "cleaning", "landscaping",
  "fencing", "snow removal", "junk removal", "moving", "automotive",
  "furniture assembly", "welding",
];

export interface KeywordResult {
  keyword: string;
  cityVariants: string[];
  serviceVariants: string[];
  estimatedPopularity: number; // 1-100 heuristic score
}

async function getInternalCities(): Promise<string[]> {
  try {
    const rows = await db
      .selectDistinct({ city: jobs.city })
      .from(jobs)
      .where(sql`${jobs.city} is not null and ${jobs.archived} = false`)
      .limit(200);

    return rows
      .map((r) => r.city)
      .filter((c): c is string => Boolean(c));
  } catch {
    return [];
  }
}

async function fetchGoogleSuggestions(query: string): Promise<string[]> {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`;
    const resp = await fetch(url, { headers: { "User-Agent": "8fold-seo-tool/1.0" } });
    if (!resp.ok) return [];
    const data = (await resp.json()) as [string, string[]];
    return Array.isArray(data[1]) ? data[1].slice(0, 10) : [];
  } catch {
    return [];
  }
}

function scoreKeyword(keyword: string, suggestions: string[]): number {
  const inSuggestions = suggestions.some((s) =>
    s.toLowerCase().includes(keyword.toLowerCase()),
  );
  const wordCount = keyword.trim().split(/\s+/).length;
  let score = inSuggestions ? 60 : 30;
  if (wordCount === 1) score += 20;
  if (wordCount === 2) score += 10;
  if (keyword.includes("near me")) score += 15;
  if (keyword.includes("hire") || keyword.includes("local")) score += 10;
  return Math.min(100, score);
}

export async function discoverKeywords(baseKeyword: string): Promise<KeywordResult[]> {
  const [suggestions, cities] = await Promise.all([
    fetchGoogleSuggestions(baseKeyword),
    getInternalCities(),
  ]);

  const relatedServices = TRADE_SERVICES.filter((s) =>
    s.includes(baseKeyword.toLowerCase()) || baseKeyword.toLowerCase().includes(s.split(" ")[0]!),
  ).slice(0, 5);

  const topCities = cities.slice(0, 10);

  const results: KeywordResult[] = [];

  // Primary keyword
  results.push({
    keyword: baseKeyword,
    cityVariants: topCities.map((c) => `${baseKeyword} ${c.toLowerCase()}`),
    serviceVariants: relatedServices.map((s) => `${s} ${baseKeyword}`),
    estimatedPopularity: scoreKeyword(baseKeyword, suggestions),
  });

  // From Google suggestions
  for (const suggestion of suggestions.slice(0, 5)) {
    if (suggestion === baseKeyword) continue;
    results.push({
      keyword: suggestion,
      cityVariants: topCities.slice(0, 5).map((c) => `${suggestion} ${c.toLowerCase()}`),
      serviceVariants: [],
      estimatedPopularity: scoreKeyword(suggestion, suggestions),
    });
  }

  // "near me" and "hire" variants
  const nearMe = `${baseKeyword} near me`;
  const hire = `hire ${baseKeyword}`;
  results.push({
    keyword: nearMe,
    cityVariants: [],
    serviceVariants: [],
    estimatedPopularity: scoreKeyword(nearMe, suggestions),
  });
  results.push({
    keyword: hire,
    cityVariants: topCities.slice(0, 5).map((c) => `${hire} in ${c.toLowerCase()}`),
    serviceVariants: [],
    estimatedPopularity: scoreKeyword(hire, suggestions),
  });

  return results.sort((a, b) => b.estimatedPopularity - a.estimatedPopularity);
}
