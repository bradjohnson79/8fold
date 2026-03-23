import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorLeads, jobPosterLeads, leadFinderCampaigns } from "@/db/schema/directoryEngine";
import { CALIFORNIA_CITIES } from "@/src/data/californiaCities";
import { JOB_POSTER_CATEGORIES } from "@/src/data/jobPosterCategories";
import { TRADE_CATEGORIES } from "@/src/data/tradeCategories";

type CampaignType = "contractor" | "jobs";

type AssignmentLead = {
  id: string;
  city: string | null;
  state: string | null;
  trade: string | null;
  category?: string | null;
};

type CampaignRecord = {
  id: string;
  name: string;
  campaignType: string;
  state: string;
  cities: unknown;
  trades: unknown;
  categories: unknown;
  sources: unknown;
  createdAt: Date;
};

type FallbackSeed = {
  name: string;
  campaignType: CampaignType;
  state: string;
  cities: string[];
  trades: string[];
  categories: string[];
  sources: string[];
  centerLat: number | null;
  centerLng: number | null;
};

type CycleResult = {
  scanned: number;
  assigned: number;
  unmatched: number;
  fallback_created: number;
};

const VALID_JOB_CATEGORIES = new Set(JOB_POSTER_CATEGORIES);
const VALID_TRADES = new Set(Object.keys(TRADE_CATEGORIES));

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isSameCity(campaign: CampaignRecord, city: string | null | undefined): boolean {
  const target = normalize(city);
  if (!target) return false;
  return asStringArray(campaign.cities).some((entry) => normalize(entry) === target);
}

function hasTradeMatch(campaign: CampaignRecord, trade: string | null | undefined): boolean {
  const target = normalize(trade);
  if (!target) return false;
  return asStringArray(campaign.trades).some((entry) => normalize(entry) === target);
}

function hasCategoryMatch(campaign: CampaignRecord, category: string | null | undefined): boolean {
  const target = normalize(category);
  if (!target) return false;
  return asStringArray(campaign.categories).some((entry) => normalize(entry) === target);
}

export function matchLeadToCampaign(
  lead: AssignmentLead,
  campaigns: CampaignRecord[],
  campaignType: CampaignType
): CampaignRecord | null {
  const city = normalize(lead.city);
  const state = normalize(lead.state) || "ca";
  const trade = normalize(lead.trade);
  const category = normalize(lead.category);

  const scoped = campaigns.filter((campaign) =>
    normalize(campaign.campaignType) === campaignType &&
    normalize(campaign.state) === state &&
    isSameCity(campaign, city)
  );

  if (campaignType === "contractor" && trade) {
    const exact = scoped
      .filter((campaign) => hasTradeMatch(campaign, trade))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return exact[0] ?? null;
  }

  if (campaignType === "jobs" && category) {
    const exact = scoped
      .filter((campaign) => hasCategoryMatch(campaign, category))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return exact[0] ?? null;
  }

  return null;
}

export function buildGenericCampaignSeed(
  lead: AssignmentLead,
  campaignType: CampaignType
): FallbackSeed | null {
  const city = String(lead.city ?? "").trim();
  const state = String(lead.state ?? "").trim().toUpperCase() || "CA";
  if (!city) return null;

  const cityMeta = state === "CA"
    ? CALIFORNIA_CITIES.find((entry) => normalize(entry.city) === normalize(city))
    : undefined;

  if (campaignType === "contractor") {
    return {
      name: `${city} General Contractors`,
      campaignType,
      state,
      cities: [city],
      trades: ["General Contractors"],
      categories: [],
      sources: ["directories"],
      centerLat: cityMeta?.lat ?? null,
      centerLng: cityMeta?.lng ?? null,
    };
  }

  return {
    name: `${city} Job Posters`,
    campaignType,
    state,
    cities: [city],
    trades: [],
    categories: ["business"],
    sources: ["directories"],
    centerLat: cityMeta?.lat ?? null,
    centerLng: cityMeta?.lng ?? null,
  };
}

async function loadCampaigns(campaignType: CampaignType): Promise<CampaignRecord[]> {
  return db
    .select({
      id: leadFinderCampaigns.id,
      name: leadFinderCampaigns.name,
      campaignType: leadFinderCampaigns.campaignType,
      state: leadFinderCampaigns.state,
      cities: leadFinderCampaigns.cities,
      trades: leadFinderCampaigns.trades,
      categories: leadFinderCampaigns.categories,
      sources: leadFinderCampaigns.sources,
      createdAt: leadFinderCampaigns.createdAt,
    })
    .from(leadFinderCampaigns)
    .where(eq(leadFinderCampaigns.campaignType, campaignType));
}

async function findOrCreateFallbackCampaign(
  lead: AssignmentLead,
  campaignType: CampaignType
): Promise<{ campaign: CampaignRecord | null; created: boolean }> {
  const seed = buildGenericCampaignSeed(lead, campaignType);
  if (!seed) return { campaign: null, created: false };

  const existing = await loadCampaigns(campaignType);
  const matched = existing.find((campaign) =>
    normalize(campaign.name) === normalize(seed.name) &&
    normalize(campaign.state) === normalize(seed.state) &&
    isSameCity(campaign, seed.cities[0]) &&
    (campaignType === "contractor"
      ? hasTradeMatch(campaign, seed.trades[0])
      : hasCategoryMatch(campaign, seed.categories[0]))
  );
  if (matched) return { campaign: matched, created: false };

  const [created] = await db.insert(leadFinderCampaigns).values({
    name: seed.name,
    campaignType: seed.campaignType,
    state: seed.state,
    cities: seed.cities,
    trades: seed.trades,
    categories: seed.categories,
    sources: seed.sources,
    centerLat: seed.centerLat,
    centerLng: seed.centerLng,
    radiusKm: 25,
    maxResultsPerCombo: 100,
    maxDomainsTotal: 10000,
    maxRuntimeMinutes: 30,
    maxApiCalls: 500,
    status: "draft",
  }).returning({
    id: leadFinderCampaigns.id,
    name: leadFinderCampaigns.name,
    campaignType: leadFinderCampaigns.campaignType,
    state: leadFinderCampaigns.state,
    cities: leadFinderCampaigns.cities,
    trades: leadFinderCampaigns.trades,
    categories: leadFinderCampaigns.categories,
    sources: leadFinderCampaigns.sources,
    createdAt: leadFinderCampaigns.createdAt,
  });

  console.log("[AutoAssign] Created fallback campaign", {
    campaignType,
    campaignId: created?.id,
    name: created?.name,
  });

  return { campaign: created ?? null, created: !!created };
}

async function assignContractorLead(
  lead: AssignmentLead,
  campaignId: string
): Promise<boolean> {
  const result = await db.update(contractorLeads)
    .set({
      campaignId,
      assignmentStatus: "assigned",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(contractorLeads.id, lead.id),
        isNull(contractorLeads.campaignId),
        eq(contractorLeads.assignmentStatus, "ready"),
        eq(contractorLeads.needsEnrichment, false)
      )
    )
    .returning({ id: contractorLeads.id });

  return result.length > 0;
}

async function assignJobLead(
  lead: AssignmentLead,
  campaignId: string
): Promise<boolean> {
  const result = await db.update(jobPosterLeads)
    .set({
      campaignId,
      assignmentStatus: "assigned",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(jobPosterLeads.id, lead.id),
        isNull(jobPosterLeads.campaignId),
        eq(jobPosterLeads.assignmentStatus, "ready"),
        eq(jobPosterLeads.needsEnrichment, false)
      )
    )
    .returning({ id: jobPosterLeads.id });

  return result.length > 0;
}

async function runPipelineCycle(campaignType: CampaignType, limit: number): Promise<CycleResult> {
  const campaigns = await loadCampaigns(campaignType);
  const leads = campaignType === "contractor"
    ? await db.select({
      id: contractorLeads.id,
      city: contractorLeads.city,
      state: contractorLeads.state,
      trade: contractorLeads.trade,
    })
      .from(contractorLeads)
      .where(
        and(
          eq(contractorLeads.assignmentStatus, "ready"),
          eq(contractorLeads.needsEnrichment, false),
          isNull(contractorLeads.campaignId),
          eq(contractorLeads.archived, false),
          sql`${contractorLeads.email} is not null and trim(${contractorLeads.email}) <> ''`
        )
      )
      .limit(limit)
    : await db.select({
      id: jobPosterLeads.id,
      city: jobPosterLeads.city,
      state: jobPosterLeads.state,
      trade: jobPosterLeads.trade,
      category: jobPosterLeads.category,
    })
      .from(jobPosterLeads)
      .where(
        and(
          eq(jobPosterLeads.assignmentStatus, "ready"),
          eq(jobPosterLeads.needsEnrichment, false),
          isNull(jobPosterLeads.campaignId),
          eq(jobPosterLeads.archived, false),
          sql`${jobPosterLeads.email} is not null and trim(${jobPosterLeads.email}) <> ''`
        )
      )
      .limit(limit);

  let assigned = 0;
  let unmatched = 0;
  let fallbackCreated = 0;

  for (const lead of leads) {
    console.log("[AutoAssign] Lead ready", { pipeline: campaignType, leadId: lead.id, city: lead.city, state: lead.state, trade: lead.trade, category: "category" in lead ? lead.category : null });

    let matched = matchLeadToCampaign(lead, campaigns, campaignType);
    if (!matched) {
      const fallback = await findOrCreateFallbackCampaign(lead, campaignType);
      matched = fallback.campaign;
      if (fallback.created && matched) {
        campaigns.unshift(matched);
        fallbackCreated++;
      }
    }

    if (!matched) {
      unmatched++;
      console.log("[AutoAssign] No campaign found", { pipeline: campaignType, leadId: lead.id });
      continue;
    }

    console.log("[AutoAssign] Campaign matched", {
      pipeline: campaignType,
      leadId: lead.id,
      campaignId: matched.id,
      campaignName: matched.name,
    });

    const didAssign = campaignType === "contractor"
      ? await assignContractorLead(lead, matched.id)
      : await assignJobLead(lead, matched.id);

    if (didAssign) {
      assigned++;
      console.log("[AutoAssign] Assigned successfully", {
        pipeline: campaignType,
        leadId: lead.id,
        campaignId: matched.id,
      });
    }
  }

  return {
    scanned: leads.length,
    assigned,
    unmatched,
    fallback_created: fallbackCreated,
  };
}

export async function runAutoAssignmentCycle(limitPerPipeline = 100): Promise<{
  contractor: CycleResult;
  jobs: CycleResult;
}> {
  const contractor = await runPipelineCycle("contractor", limitPerPipeline);
  const jobs = await runPipelineCycle("jobs", limitPerPipeline);
  return { contractor, jobs };
}

export async function getAutoAssignedLeadCounts(campaignIds: string[]): Promise<Record<string, number>> {
  if (campaignIds.length === 0) return {};

  const contractorCounts = await db.select({
    campaignId: contractorLeads.campaignId,
    count: sql<number>`count(*)::int`,
  })
    .from(contractorLeads)
    .where(
      and(
        inArray(contractorLeads.campaignId, campaignIds),
        eq(contractorLeads.assignmentStatus, "assigned")
      )
    )
    .groupBy(contractorLeads.campaignId);

  const jobCounts = await db.select({
    campaignId: jobPosterLeads.campaignId,
    count: sql<number>`count(*)::int`,
  })
    .from(jobPosterLeads)
    .where(
      and(
        inArray(jobPosterLeads.campaignId, campaignIds),
        eq(jobPosterLeads.assignmentStatus, "assigned")
      )
    )
    .groupBy(jobPosterLeads.campaignId);

  const counts: Record<string, number> = {};
  for (const row of contractorCounts) {
    if (row.campaignId) counts[row.campaignId] = Number(row.count ?? 0);
  }
  for (const row of jobCounts) {
    if (row.campaignId) counts[row.campaignId] = (counts[row.campaignId] ?? 0) + Number(row.count ?? 0);
  }
  return counts;
}

export function isRecognizedTrade(trade: string | null | undefined): boolean {
  return VALID_TRADES.has(String(trade ?? "").trim());
}

export function isRecognizedJobCategory(category: string | null | undefined): boolean {
  return VALID_JOB_CATEGORIES.has(String(category ?? "").trim() as typeof JOB_POSTER_CATEGORIES[number]);
}
