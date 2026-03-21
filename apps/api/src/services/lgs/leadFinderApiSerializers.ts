type MaybeDate = Date | string | null | undefined;

function toIso(value: MaybeDate): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function serializeLeadFinderCampaign(campaign: Record<string, unknown>) {
  return {
    id: campaign.id,
    name: campaign.name,
    campaignType: campaign.campaignType,
    state: campaign.state,
    cities: campaign.cities,
    trades: campaign.trades,
    categories: campaign.categories,
    sources: campaign.sources,
    max_results_per_combo: campaign.maxResultsPerCombo,
    jobs_total: campaign.jobsTotal,
    jobs_complete: campaign.jobsComplete,
    domains_found: campaign.domainsFound,
    unique_domains: campaign.uniqueDomains,
    domains_sent: campaign.domainsSent,
    started_at: toIso(campaign.startedAt as MaybeDate),
    finished_at: toIso(campaign.finishedAt as MaybeDate),
    elapsed_seconds: campaign.elapsedSeconds,
    domains_per_second: campaign.domainsPerSecond,
    status: campaign.status,
    error_message: campaign.errorMessage,
    created_at: toIso(campaign.createdAt as MaybeDate),
    center_lat: campaign.centerLat,
    center_lng: campaign.centerLng,
    radius_km: campaign.radiusKm,
    max_api_calls: campaign.maxApiCalls,
  };
}

export function serializeLeadFinderJob(job: Record<string, unknown>) {
  return {
    id: job.id,
    city: job.city,
    state: job.state,
    trade: job.trade,
    category: job.category,
    source: job.source,
    status: job.status,
    domains_found: job.domainsFound,
    error_message: job.errorMessage,
    created_at: toIso(job.createdAt as MaybeDate),
  };
}

export function serializeLeadFinderDomain(domain: Record<string, unknown>) {
  return {
    id: domain.id,
    domain: domain.domain,
    business_name: domain.businessName,
    trade: domain.trade,
    category: domain.category,
    city: domain.city,
    state: domain.state,
    source: domain.source,
    sent_to_discovery: domain.sentToDiscovery,
    discovery_run_id: domain.discoveryRunId,
    website_url: domain.websiteUrl,
    formatted_address: domain.formattedAddress,
    phone: domain.phone,
    place_id: domain.placeId,
    created_at: toIso(domain.createdAt as MaybeDate),
  };
}
