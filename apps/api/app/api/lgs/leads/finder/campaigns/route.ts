/**
 * LGS Lead Finder: list campaigns (GET) and create + start a campaign (POST).
 */
import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { leadFinderCampaigns } from "@/db/schema/directoryEngine";
import { runLeadFinderCampaign } from "@/src/services/lgs/leadFinderService";
import { serializeLeadFinderCampaign } from "@/src/services/lgs/leadFinderApiSerializers";
import { CALIFORNIA_CITIES } from "@/src/data/californiaCities";
import { JOB_POSTER_CATEGORIES } from "@/src/data/jobPosterCategories";
import { TRADE_CATEGORIES } from "@/src/data/tradeCategories";

export async function GET() {
  try {
    const campaigns = await db
      .select()
      .from(leadFinderCampaigns)
      .orderBy(desc(leadFinderCampaigns.createdAt));

    return NextResponse.json({ ok: true, data: campaigns.map((campaign) => serializeLeadFinderCampaign(campaign)) });
  } catch (err) {
    console.error("LeadFinder campaigns GET error:", err);
    return NextResponse.json({ ok: false, error: "fetch_failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      campaign_type?: "contractor" | "jobs";
      state?: string;
      cities?: string[];
      trades?: string[];
      categories?: string[];
      sources?: string[];
      max_results_per_combo?: number;
      max_domains_total?: number;
      max_runtime_minutes?: number;
      // Geo radius fields
      center_lat?: number | null;
      center_lng?: number | null;
      radius_km?: number | null;
      max_api_calls?: number | null;
    };

    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
    }

    const state = body.state ?? "CA";
    const campaignType = body.campaign_type === "jobs" ? "jobs" : "contractor";

    // Validate cities against known CA cities (or allow custom if state is different)
    const validCityNames = new Set(CALIFORNIA_CITIES.map((c) => c.city));
    const cities = (body.cities ?? []).filter((c) =>
      state !== "CA" || validCityNames.has(c)
    );
    if (cities.length === 0) {
      return NextResponse.json({ ok: false, error: "at_least_one_city_required" }, { status: 400 });
    }

    const validTrades = new Set(Object.keys(TRADE_CATEGORIES));
    const validCategories = new Set(JOB_POSTER_CATEGORIES);
    const trades = (body.trades ?? []).filter((t) => validTrades.has(t));
    const categories = (body.categories ?? []).filter((c) => validCategories.has(c as typeof JOB_POSTER_CATEGORIES[number]));
    if (campaignType === "contractor" && trades.length === 0) {
      return NextResponse.json({ ok: false, error: "at_least_one_trade_required" }, { status: 400 });
    }
    if (campaignType === "jobs" && categories.length === 0) {
      return NextResponse.json({ ok: false, error: "at_least_one_category_required" }, { status: 400 });
    }

    const validSources = new Set(["google_maps", "google_search", "yelp", "directories"]);
    const sources = (body.sources ?? ["google_maps"]).filter((s) => validSources.has(s));
    if (sources.length === 0) {
      return NextResponse.json({ ok: false, error: "at_least_one_source_required" }, { status: 400 });
    }

    const [campaign] = await db.insert(leadFinderCampaigns).values({
      name,
      campaignType,
      state,
      cities,
      trades,
      categories,
      sources,
      maxResultsPerCombo: body.max_results_per_combo ?? 100,
      maxDomainsTotal: body.max_domains_total ?? 10000,
      maxRuntimeMinutes: body.max_runtime_minutes ?? 30,
      centerLat: body.center_lat ?? null,
      centerLng: body.center_lng ?? null,
      radiusKm: body.radius_km ?? 25,
      maxApiCalls: body.max_api_calls ?? 500,
      status: "draft",
    }).returning();

    // Kick off async campaign run
    setImmediate(() => {
      runLeadFinderCampaign(campaign.id).catch((err) => {
        console.error(`[LeadFinder] Campaign ${campaign.id} error:`, err);
        db.update(leadFinderCampaigns)
          .set({ status: "failed", errorMessage: err instanceof Error ? err.message : "unknown", finishedAt: new Date() })
          .then(() => {});
      });
    });

    return NextResponse.json({ ok: true, data: serializeLeadFinderCampaign(campaign) }, { status: 201 });
  } catch (err) {
    console.error("LeadFinder campaigns POST error:", err);
    return NextResponse.json({ ok: false, error: "create_failed" }, { status: 500 });
  }
}

// Expose static data (cities + trades) for UI
export async function OPTIONS() {
  return NextResponse.json({
    ok: true,
    data: {
      cities: CALIFORNIA_CITIES,
          campaign_types: [
            { id: "contractor", label: "Contractors" },
            { id: "jobs", label: "Job Posters" },
          ],
      trades: Object.keys(TRADE_CATEGORIES),
          categories: JOB_POSTER_CATEGORIES,
      sources: [
        { id: "google_maps",    label: "Google Maps" },
        { id: "google_search",  label: "Google Search" },
        { id: "yelp",           label: "Yelp" },
        { id: "directories",    label: "Directories (BBB, Houzz, BuildZoom)" },
      ],
    },
  });
}
