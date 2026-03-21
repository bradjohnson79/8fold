"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { LeadFinderMap, type LatLng } from "@/components/LeadFinderMap";

// ─── Types ────────────────────────────────────────────────────────────────────

type Campaign = {
  id: string;
  name: string;
  campaignType: "contractor" | "jobs";
  state: string;
  cities: string[];
  trades: string[];
  categories: string[];
  sources: string[];
  max_results_per_combo: number;
  jobs_total: number;
  jobs_complete: number;
  domains_found: number;
  unique_domains: number;
  domains_sent: number;
  started_at: string | null;
  finished_at: string | null;
  elapsed_seconds: number | null;
  domains_per_second: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  // Geo radius fields
  center_lat: number | null;
  center_lng: number | null;
  radius_km: number | null;
  max_api_calls: number | null;
};

type Job = {
  id: string;
  city: string;
  trade: string | null;
  category: string | null;
  source: string;
  status: string;
  domains_found: number;
};

type Domain = {
  id: string;
  domain: string | null;
  business_name: string | null;
  trade: string | null;
  category: string | null;
  city: string | null;
  state?: string | null;
  source: string | null;
  sent_to_discovery: boolean;
  website_url?: string | null;
  formatted_address?: string | null;
  phone?: string | null;
  place_id?: string | null;
};

type StaticData = {
  cities: Array<{ city: string; state: string; county: string; population: number; lat?: number; lng?: number }>;
  campaign_types: Array<{ id: "contractor" | "jobs"; label: string }>;
  trades: string[];
  categories: string[];
  sources: Array<{ id: string; label: string }>;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const RUNNING_STATUSES = ["running", "cancel_requested"];
const SOURCE_LABELS: Record<string, string> = {
  google_maps:   "Google Maps",
  google_search: "Google Search",
  yelp:          "Yelp",
  directories:   "Directories",
};
const STATUS_COLORS: Record<string, string> = {
  running:          "#60a5fa",
  cancel_requested: "#f87171",
  cancelled:        "#f87171",
  complete:         "#4ade80",
  failed:           "#f87171",
  draft:            "#94a3b8",
};

// ─── Small components ─────────────────────────────────────────────────────────

function StatCard({ label, value, color = "#f8fafc", sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div style={{ background: "#0f172a", borderRadius: 8, padding: "0.9rem 1.1rem", textAlign: "center", minWidth: 110 }}>
      <div style={{ fontSize: "1.4rem", fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "0.2rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      {sub && <div style={{ fontSize: "0.7rem", color: "#475569", marginTop: "0.1rem" }}>{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      padding: "0.2rem 0.55rem",
      borderRadius: 4,
      fontSize: "0.72rem",
      fontWeight: 600,
      background: "#0f172a",
      color: STATUS_COLORS[status] ?? "#94a3b8",
      textTransform: "uppercase",
      letterSpacing: "0.04em",
    }}>
      {status.replace("_", " ")}
    </span>
  );
}

function ProgressBar({ pct, color = "#3b82f6" }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 6, background: "#0f172a", borderRadius: 3, overflow: "hidden", margin: "0.5rem 0" }}>
      <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: color, transition: "width 0.5s ease", borderRadius: 3 }} />
    </div>
  );
}

// ─── Multi-select chip component ──────────────────────────────────────────────

function MultiSelect({
  label, options, selected, onChange, searchable = false
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  searchable?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filtered = searchable ? options.filter((o) => o.toLowerCase().includes(search.toLowerCase())) : options;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div
        onClick={() => setOpen(!open)}
        style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 7, padding: "0.5rem 0.75rem", cursor: "pointer", minHeight: 38, display: "flex", flexWrap: "wrap", gap: "0.3rem", alignItems: "center" }}
      >
        {selected.length === 0 ? (
          <span style={{ color: "#475569", fontSize: "0.85rem" }}>Select {label.toLowerCase()}…</span>
        ) : (
          selected.map((s) => (
            <span key={s} style={{ background: "#1e3a2f", color: "#4ade80", borderRadius: 4, padding: "0.15rem 0.5rem", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
              {s}
              <span onClick={(e) => { e.stopPropagation(); toggle(s); }} style={{ cursor: "pointer", color: "#64748b" }}>×</span>
            </span>
          ))
        )}
      </div>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200, background: "#1e293b", border: "1px solid #334155", borderRadius: 7, marginTop: 4, maxHeight: 240, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
          {searchable && (
            <div style={{ padding: "0.5rem" }}>
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: 5, color: "#f8fafc", padding: "0.4rem 0.6rem", fontSize: "0.85rem" }}
              />
            </div>
          )}
          <div style={{ padding: "0.25rem 0" }}>
            {filtered.map((o) => (
              <div
                key={o}
                onClick={() => toggle(o)}
                style={{ padding: "0.45rem 0.75rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", color: selected.includes(o) ? "#4ade80" : "#e2e8f0" }}
              >
                <span style={{ width: 14, height: 14, border: `1px solid ${selected.includes(o) ? "#4ade80" : "#475569"}`, borderRadius: 3, background: selected.includes(o) ? "#1e3a2f" : "transparent", display: "inline-block", flexShrink: 0 }} />
                {o}
              </div>
            ))}
          </div>
          <div style={{ padding: "0.4rem 0.75rem", borderTop: "1px solid #334155", display: "flex", gap: "1rem", fontSize: "0.78rem" }}>
            <button onClick={() => onChange(filtered)} style={{ background: "none", border: "none", color: "#4ade80", cursor: "pointer", padding: 0 }}>All</button>
            <button onClick={() => onChange([])} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", padding: 0 }}>Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LeadFinderPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [staticData, setStaticData] = useState<StaticData | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ batches: number; domains: number } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formCampaignType, setFormCampaignType] = useState<"contractor" | "jobs">("contractor");
  const [formCities, setFormCities] = useState<string[]>([]);
  const [formTrades, setFormTrades] = useState<string[]>([]);
  const [formCategories, setFormCategories] = useState<string[]>([]);
  const [formSources, setFormSources] = useState<string[]>(["google_maps"]);
  const [formMaxResults, setFormMaxResults] = useState(100);
  // Geo state
  const [formRadiusKm, setFormRadiusKm] = useState(25);
  const [formCenter, setFormCenter] = useState<LatLng>({ lat: 37.3382, lng: -121.8863 }); // default: San Jose
  const [formMaxApiCalls, setFormMaxApiCalls] = useState(500);
  const [showMap, setShowMap] = useState(false);

  // Load campaigns list and static data
  const loadCampaigns = useCallback(async () => {
    const [campsRes, staticRes] = await Promise.all([
      fetch("/api/lgs/leads/finder/campaigns"),
      fetch("/api/lgs/leads/finder/campaigns", { method: "OPTIONS" }),
    ]);
    const campsJson = await campsRes.json().catch(() => ({})) as { ok?: boolean; data?: Campaign[] };
    const staticJson = await staticRes.json().catch(() => ({})) as { ok?: boolean; data?: StaticData };
    if (campsJson.ok && campsJson.data) setCampaigns(campsJson.data);
    if (staticJson.ok && staticJson.data) setStaticData(staticJson.data);
  }, []);

  // Load a specific campaign's detail
  const loadCampaignDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/lgs/leads/finder/campaigns/${id}`);
    const json = await res.json().catch(() => ({})) as {
      ok?: boolean;
      data?: { campaign: Campaign; jobs: Job[]; domains: Domain[] };
    };
    if (json.ok && json.data) {
      setSelectedCampaign(json.data.campaign);
      setJobs(json.data.jobs);
      setDomains(json.data.domains);
    }
  }, []);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  // Auto-populate map center from first selected city
  useEffect(() => {
    if (!staticData || formCities.length === 0) return;
    const firstCity = staticData.cities.find((c) => c.city === formCities[0]);
    if (firstCity?.lat != null && firstCity?.lng != null) {
      setFormCenter({ lat: firstCity.lat, lng: firstCity.lng });
    }
  }, [formCities, staticData]);

  // Auto-poll selected campaign while running
  useEffect(() => {
    if (!selectedCampaign || !RUNNING_STATUSES.includes(selectedCampaign.status)) return;
    const interval = setInterval(() => loadCampaignDetail(selectedCampaign.id), 3000);
    return () => clearInterval(interval);
  }, [selectedCampaign, loadCampaignDetail]);

  // Also refresh campaign list when a campaign completes
  useEffect(() => {
    const hasPending = campaigns.some((c) => RUNNING_STATUSES.includes(c.status));
    if (!hasPending) return;
    const interval = setInterval(loadCampaigns, 5000);
    return () => clearInterval(interval);
  }, [campaigns, loadCampaigns]);

  async function handleCreateCampaign(e: React.FormEvent) {
    e.preventDefault();
    const selectedUnits = formCampaignType === "jobs" ? formCategories : formTrades;
    if (!formName.trim() || formCities.length === 0 || selectedUnits.length === 0 || formSources.length === 0) {
      setErr(`Fill in name, at least one city, ${formCampaignType === "jobs" ? "category" : "trade"}, and source.`);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/lgs/leads/finder/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          campaign_type: formCampaignType,
          state: "CA",
          cities: formCities,
          trades: formTrades,
          categories: formCategories,
          sources: formSources,
          max_results_per_combo: formMaxResults,
          center_lat: formCenter.lat,
          center_lng: formCenter.lng,
          radius_km: formRadiusKm,
          max_api_calls: formMaxApiCalls,
        }),
      });
      const json = await res.json().catch(() => ({})) as { ok?: boolean; data?: Campaign; error?: string };
      if (json.ok && json.data) {
        setShowForm(false);
        setFormName(""); setFormCampaignType("contractor"); setFormCities([]); setFormTrades([]); setFormCategories([]); setFormSources(["google_maps"]);
        setFormMaxResults(100); setFormRadiusKm(25); setFormMaxApiCalls(500); setShowMap(false);
        await loadCampaigns();
        setSelectedCampaign(json.data);
        await loadCampaignDetail(json.data.id);
      } else {
        setErr(json.error ?? "Failed to create campaign");
      }
    } catch (e) { setErr(String(e)); }
    finally { setLoading(false); }
  }

  async function handleSendToDiscovery() {
    if (!selectedCampaign) return;
    setSending(true); setSendResult(null);
    try {
      const res = await fetch(`/api/lgs/leads/finder/campaigns/${selectedCampaign.id}/send`, { method: "POST" });
      const json = await res.json().catch(() => ({})) as {
        ok?: boolean;
        data?: { batches_created: number; domains_sent: number };
      };
      if (json.ok && json.data) {
        setSendResult({ batches: json.data.batches_created, domains: json.data.domains_sent });
        await loadCampaignDetail(selectedCampaign.id);
        await loadCampaigns();
      }
    } catch { /* silent */ }
    finally { setSending(false); }
  }

  async function handleCancelConfirm() {
    if (!selectedCampaign) return;
    setCancelling(true); setShowCancelModal(false);
    await fetch(`/api/lgs/leads/finder/campaigns/${selectedCampaign.id}/cancel`, { method: "POST" });
    setCancelling(false);
  }

  const formatElapsed = (seconds: number | null): string => {
    if (!seconds) return "—";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const getUnitValues = (campaign: Pick<Campaign, "campaignType" | "trades" | "categories">): string[] =>
    campaign.campaignType === "jobs" ? (campaign.categories as string[]) : (campaign.trades as string[]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 960 }}>
      {/* Cancel confirmation modal */}
      {showCancelModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#1e293b", borderRadius: 12, padding: "2rem", maxWidth: 400, width: "90%", border: "1px solid #334155" }}>
            <h3 style={{ margin: "0 0 0.75rem", color: "#f8fafc" }}>Cancel Campaign?</h3>
            <p style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
              The campaign will stop after the current batch. Domains already staged will remain and can still be sent to discovery.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button onClick={() => setShowCancelModal(false)} style={{ padding: "0.5rem 1rem", background: "transparent", border: "1px solid #475569", borderRadius: 7, color: "#94a3b8", cursor: "pointer" }}>
                Keep Running
              </button>
              <button onClick={handleCancelConfirm} style={{ padding: "0.5rem 1rem", background: "#dc2626", border: "none", borderRadius: 7, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                Cancel Campaign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ margin: "0 0 0.35rem" }}>Lead Finder</h1>
          <p style={{ color: "#64748b", margin: 0, fontSize: "0.9rem" }}>
            Discover contractor or job-poster websites by city, then send them to Domain Discovery for contact extraction.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setSelectedCampaign(null); setErr(null); }}
          style={{ padding: "0.6rem 1.2rem", background: "#22c55e", color: "#0f172a", fontWeight: 700, border: "none", borderRadius: 8, cursor: "pointer", fontSize: "0.9rem", whiteSpace: "nowrap" }}
        >
          + New Campaign
        </button>
      </div>

      {/* New Campaign form */}
      {showForm && (
        <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.5rem", marginBottom: "2rem", border: "1px solid #334155" }}>
          <h2 style={{ margin: "0 0 1.25rem", fontSize: "1rem", fontWeight: 600 }}>New Discovery Campaign</h2>
          <form onSubmit={handleCreateCampaign}>
            {/* Row 1: Name + Pipeline + Max Results */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <div>
                <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Campaign Name</div>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. CA Roofing Regional — Jan 2026"
                  style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: 7, color: "#f8fafc", padding: "0.5rem 0.75rem", fontSize: "0.875rem", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Campaign Type</div>
                <select
                  value={formCampaignType}
                  onChange={(e) => {
                    const value = e.target.value as "contractor" | "jobs";
                    setFormCampaignType(value);
                    setFormTrades([]);
                    setFormCategories([]);
                  }}
                  style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: 7, color: "#f8fafc", padding: "0.5rem 0.75rem", fontSize: "0.875rem" }}
                >
                  {(staticData?.campaign_types ?? [
                    { id: "contractor", label: "Contractors" },
                    { id: "jobs", label: "Job Posters" },
                  ]).map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Max Results / Combo</div>
                <select
                  value={formMaxResults}
                  onChange={(e) => setFormMaxResults(Number(e.target.value))}
                  style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: 7, color: "#f8fafc", padding: "0.5rem 0.75rem", fontSize: "0.875rem" }}
                >
                  {[10, 25, 50, 100, 200, 300, 400, 500].map((v) => <option key={v} value={v}>{v} results</option>)}
                </select>
              </div>
            </div>

            {/* Row 2: Cities + Dynamic Unit */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <MultiSelect
                label="Cities"
                options={staticData?.cities.map((c) => c.city) ?? []}
                selected={formCities}
                onChange={setFormCities}
                searchable
              />
              <MultiSelect
                label={formCampaignType === "jobs" ? "Categories" : "Trades"}
                options={formCampaignType === "jobs" ? (staticData?.categories ?? []) : (staticData?.trades ?? [])}
                selected={formCampaignType === "jobs" ? formCategories : formTrades}
                onChange={formCampaignType === "jobs" ? setFormCategories : setFormTrades}
              />
            </div>

            {/* Row 3: Radius selector + Map toggle */}
            <div style={{ background: "#0f172a", borderRadius: 8, padding: "1rem", marginBottom: "1rem", border: "1px solid #1e293b" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "0.75rem" }}>
                <div>
                  <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Search Radius</div>
                  <select
                    value={formRadiusKm}
                    onChange={(e) => setFormRadiusKm(Number(e.target.value))}
                    style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: 7, color: "#f8fafc", padding: "0.5rem 0.75rem", fontSize: "0.875rem" }}
                  >
                    {[10, 25, 50, 75, 100].map((v) => <option key={v} value={v}>{v} km</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Max API Calls</div>
                  <select
                    value={formMaxApiCalls}
                    onChange={(e) => setFormMaxApiCalls(Number(e.target.value))}
                    style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: 7, color: "#f8fafc", padding: "0.5rem 0.75rem", fontSize: "0.875rem" }}
                  >
                    {[100, 200, 500, 1000, 2000].map((v) => <option key={v} value={v}>{v} calls</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Center Point</div>
                  <div style={{ fontSize: "0.8rem", color: "#94a3b8", padding: "0.5rem 0", display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <span style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                      {formCenter.lat.toFixed(4)}, {formCenter.lng.toFixed(4)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowMap((v) => !v)}
                      style={{ padding: "0.2rem 0.6rem", background: showMap ? "#1e3a2f" : "#1e293b", border: `1px solid ${showMap ? "#22c55e" : "#334155"}`, borderRadius: 5, color: showMap ? "#4ade80" : "#94a3b8", cursor: "pointer", fontSize: "0.75rem" }}
                    >
                      {showMap ? "Hide Map" : "Show Map"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Coverage description */}
              <div style={{ fontSize: "0.78rem", color: "#475569" }}>
                Radius {formRadiusKm} km covers approximately {formRadiusKm >= 50 ? "multiple cities" : formRadiusKm >= 25 ? "city + suburbs" : "city core"} around the center point.
                {formCities.length > 0 && ` Auto-centered on ${formCities[0]}.`}
              </div>

              {/* Interactive Map */}
              {showMap && (
                <div style={{ marginTop: "0.75rem" }}>
                  <LeadFinderMap
                    center={formCenter}
                    radiusKm={formRadiusKm}
                    onCenterChange={setFormCenter}
                    height={300}
                  />
                </div>
              )}
            </div>

            {/* Row 4: Sources */}
            <div style={{ marginBottom: "1.25rem" }}>
              <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Discovery Sources</div>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                {(staticData?.sources ?? [{ id: "google_maps", label: "Google Maps" }]).map((s) => (
                  <label key={s.id} style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontSize: "0.875rem", color: "#e2e8f0" }}>
                    <input
                      type="checkbox"
                      checked={formSources.includes(s.id)}
                      onChange={() => setFormSources(formSources.includes(s.id) ? formSources.filter((x) => x !== s.id) : [...formSources, s.id])}
                    />
                    {s.label}
                    {s.id === "google_maps" && (
                      <span style={{ fontSize: "0.7rem", color: "#475569", marginLeft: "0.2rem" }}>
                        (uses radius)
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {err && (
              <div style={{ padding: "0.6rem 0.9rem", background: "#3b1a1a", borderRadius: 7, color: "#fca5a5", marginBottom: "1rem", fontSize: "0.85rem" }}>{err}</div>
            )}

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                type="submit"
                disabled={loading}
                style={{ padding: "0.65rem 1.4rem", background: loading ? "#1e293b" : "#22c55e", color: loading ? "#475569" : "#0f172a", fontWeight: 700, border: "none", borderRadius: 8, cursor: loading ? "not-allowed" : "pointer" }}
              >
                {loading ? "Starting…" : "Start Discovery"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={{ padding: "0.65rem 1rem", background: "transparent", border: "1px solid #475569", borderRadius: 8, color: "#94a3b8", cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Campaign list */}
      {!selectedCampaign && campaigns.length === 0 && !showForm && (
        <div style={{ textAlign: "center", color: "#475569", padding: "4rem 0" }}>
          No campaigns yet. Click <strong style={{ color: "#94a3b8" }}>+ New Campaign</strong> to start discovering contractor or job-poster websites.
        </div>
      )}

      {!selectedCampaign && campaigns.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {campaigns.map((c) => (
            <div
              key={c.id}
              style={{ background: "#1e293b", borderRadius: 10, padding: "1.1rem 1.4rem", cursor: "pointer", border: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}
              onClick={() => { setSelectedCampaign(c); setSendResult(null); loadCampaignDetail(c.id); }}
            >
              <div>
                <div style={{ fontWeight: 600, color: "#f8fafc", marginBottom: "0.25rem" }}>{c.name}</div>
                <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                  <span style={{ textTransform: "capitalize" }}>{c.campaignType}</span> · {(c.cities as unknown as string[]).length} cities · {getUnitValues(c).length} {c.campaignType === "jobs" ? "categories" : "trades"} · {(c.sources as unknown as string[]).map((s) => SOURCE_LABELS[s] ?? s).join(", ")}
                </div>
              </div>
              <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexShrink: 0 }}>
                <div style={{ textAlign: "right", fontSize: "0.82rem" }}>
                  <div style={{ color: "#4ade80", fontWeight: 700 }}>{(c.unique_domains ?? 0).toLocaleString()} domains</div>
                  <div style={{ color: "#64748b" }}>{formatElapsed(c.elapsed_seconds)}</div>
                </div>
                <StatusBadge status={c.status} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Campaign detail */}
      {selectedCampaign && (
        <div>
          <button
            onClick={() => { setSelectedCampaign(null); setSendResult(null); loadCampaigns(); }}
            style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", marginBottom: "1rem", fontSize: "0.875rem", padding: 0 }}
          >
            ← All Campaigns
          </button>

          <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.5rem", marginBottom: "1.5rem" }}>
            {/* Campaign header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
              <div>
                <h2 style={{ margin: "0 0 0.3rem", fontSize: "1.1rem" }}>{selectedCampaign.name}</h2>
                <div style={{ fontSize: "0.82rem", color: "#64748b" }}>
                  <span style={{ textTransform: "capitalize" }}>{selectedCampaign.campaignType}</span> ·{" "}
                  {(selectedCampaign.cities as unknown as string[]).join(", ")} ·{" "}
                  {getUnitValues(selectedCampaign).join(", ")} ·{" "}
                  {(selectedCampaign.sources as unknown as string[]).map((s) => SOURCE_LABELS[s] ?? s).join(", ")}
                  {selectedCampaign.radius_km != null && (
                    <span style={{ marginLeft: "0.5rem", color: "#60a5fa" }}>
                      · {selectedCampaign.radius_km} km radius
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                {RUNNING_STATUSES.includes(selectedCampaign.status) && (
                  <button
                    onClick={() => setShowCancelModal(true)}
                    disabled={cancelling}
                    style={{ padding: "0.4rem 0.85rem", background: "#450a0a", border: "1px solid #dc2626", borderRadius: 6, color: "#f87171", fontWeight: 600, cursor: "pointer", fontSize: "0.8rem" }}
                  >
                    Cancel
                  </button>
                )}
                <StatusBadge status={selectedCampaign.status} />
              </div>
            </div>

            {/* Progress bar while running */}
            {RUNNING_STATUSES.includes(selectedCampaign.status) && selectedCampaign.jobs_total > 0 && (
              <div style={{ marginBottom: "0.75rem" }}>
                <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: "0.25rem" }}>
                  {selectedCampaign.jobs_complete} / {selectedCampaign.jobs_total} jobs complete
                </div>
                <ProgressBar
                  pct={(selectedCampaign.jobs_complete / selectedCampaign.jobs_total) * 100}
                  color={selectedCampaign.status === "cancel_requested" ? "#ef4444" : "#3b82f6"}
                />
              </div>
            )}

            {/* Stats cards */}
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <StatCard label="Jobs" value={`${selectedCampaign.jobs_complete}/${selectedCampaign.jobs_total}`} />
              <StatCard label="Domains Found" value={selectedCampaign.domains_found} color="#a78bfa" />
              <StatCard label="Unique Domains" value={selectedCampaign.unique_domains} color="#fbbf24" />
              <StatCard label="Sent to Discovery" value={selectedCampaign.domains_sent} color="#38bdf8" />
              <StatCard label="Runtime" value={formatElapsed(selectedCampaign.elapsed_seconds)} color="#f8fafc" />
              {selectedCampaign.domains_per_second && parseFloat(selectedCampaign.domains_per_second) > 0 && (
                <StatCard label="Domains/sec" value={selectedCampaign.domains_per_second} color="#34d399" />
              )}
            </div>
          </div>

          {/* Send to discovery action */}
          {selectedCampaign.status === "complete" && selectedCampaign.unique_domains > selectedCampaign.domains_sent && (
            <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.25rem 1.5rem", marginBottom: "1.5rem", border: "1px solid #334155" }}>
              {sendResult ? (
                <div style={{ color: "#4ade80", fontSize: "0.9rem" }}>
                  <strong>{sendResult.domains.toLocaleString()} domains</strong> sent to Domain Discovery in {sendResult.batches} batch{sendResult.batches !== 1 ? "es" : ""}.{" "}
                  <Link href="/discovery" style={{ color: "#38bdf8" }}>View Discovery Runs →</Link>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, color: "#f8fafc", marginBottom: "0.2rem" }}>
                      {(selectedCampaign.unique_domains - selectedCampaign.domains_sent).toLocaleString()} domains ready to send
                    </div>
                    <div style={{ fontSize: "0.82rem", color: "#64748b" }}>
                      Will be chunked into batches of 200 discovery runs. Emails will be extracted and verified automatically.
                    </div>
                  </div>
                  <button
                    onClick={handleSendToDiscovery}
                    disabled={sending}
                    style={{ padding: "0.65rem 1.3rem", background: sending ? "#1e293b" : "#3b82f6", color: sending ? "#475569" : "#fff", fontWeight: 700, border: "none", borderRadius: 8, cursor: sending ? "not-allowed" : "pointer", whiteSpace: "nowrap", marginLeft: "1rem" }}
                  >
                    {sending ? "Sending…" : "Send to Domain Discovery"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Jobs table */}
          {jobs.length > 0 && (
            <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.25rem 1.5rem", marginBottom: "1.5rem" }}>
              <h3 style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Jobs ({jobs.length})</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #334155", color: "#64748b" }}>
                      {["City", selectedCampaign.campaignType === "jobs" ? "Category" : "Trade", "Source", "Status", "Domains"].map((h) => (
                        <th key={h} style={{ padding: "0.4rem 0.75rem", textAlign: "left", fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((j) => (
                      <tr key={j.id} style={{ borderBottom: "1px solid #0f172a" }}>
                        <td style={{ padding: "0.4rem 0.75rem", color: "#f8fafc" }}>{j.city}</td>
                        <td style={{ padding: "0.4rem 0.75rem", color: "#94a3b8" }}>{j.category ?? j.trade ?? "—"}</td>
                        <td style={{ padding: "0.4rem 0.75rem" }}>
                          <span style={{ background: "#0f172a", padding: "0.15rem 0.45rem", borderRadius: 4, color: "#38bdf8", fontFamily: "monospace", fontSize: "0.78rem" }}>
                            {SOURCE_LABELS[j.source] ?? j.source}
                          </span>
                        </td>
                        <td style={{ padding: "0.4rem 0.75rem" }}><StatusBadge status={j.status} /></td>
                        <td style={{ padding: "0.4rem 0.75rem", color: j.domains_found > 0 ? "#4ade80" : "#475569", fontWeight: j.domains_found > 0 ? 700 : 400 }}>
                          {j.domains_found}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Domains table */}
          {domains.length > 0 && (
            <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.25rem 1.5rem" }}>
              <h3 style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Discovered Domains (showing {domains.length})
              </h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #334155", color: "#64748b" }}>
                      {["Domain", "Business", selectedCampaign.campaignType === "jobs" ? "Category" : "Trade", "City", "Source", "Sent"].map((h) => (
                        <th key={h} style={{ padding: "0.4rem 0.75rem", textAlign: "left", fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {domains.map((d) => (
                      <tr key={d.id} style={{ borderBottom: "1px solid #0f172a" }}>
                        <td style={{ padding: "0.4rem 0.75rem" }}>
                          {d.domain ? (
                            <a href={`https://${d.domain}`} target="_blank" rel="noopener noreferrer" style={{ color: "#38bdf8", fontFamily: "monospace", fontSize: "0.78rem" }}>
                              {d.domain}
                            </a>
                          ) : d.website_url ? (
                            <a href={d.website_url} target="_blank" rel="noopener noreferrer" style={{ color: "#38bdf8", fontFamily: "monospace", fontSize: "0.78rem" }}>
                              {d.website_url}
                            </a>
                          ) : (
                            <span style={{ color: "#64748b", fontSize: "0.78rem" }}>No website</span>
                          )}
                        </td>
                        <td style={{ padding: "0.4rem 0.75rem", color: "#94a3b8", maxWidth: 260 }}>
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {d.business_name ?? "—"}
                          </div>
                          {d.formatted_address && (
                            <div style={{ color: "#64748b", fontSize: "0.74rem", marginTop: "0.18rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {d.formatted_address}
                            </div>
                          )}
                          {d.phone && (
                            <div style={{ color: "#64748b", fontSize: "0.74rem", marginTop: "0.12rem" }}>
                              {d.phone}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "0.4rem 0.75rem", color: "#64748b" }}>{d.category ?? d.trade ?? "—"}</td>
                        <td style={{ padding: "0.4rem 0.75rem", color: "#64748b" }}>{d.city ?? "—"}</td>
                        <td style={{ padding: "0.4rem 0.75rem" }}>
                          <span style={{ background: "#0f172a", padding: "0.15rem 0.4rem", borderRadius: 4, color: "#64748b", fontSize: "0.75rem" }}>
                            {SOURCE_LABELS[d.source ?? ""] ?? d.source}
                          </span>
                        </td>
                        <td style={{ padding: "0.4rem 0.75rem" }}>
                          <span style={{ color: d.sent_to_discovery ? "#4ade80" : "#475569", fontSize: "0.78rem" }}>
                            {d.sent_to_discovery ? "✓ Sent" : "Pending"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <Link href="/leads" style={{ display: "inline-block", marginTop: "2rem", color: "#64748b", fontSize: "0.875rem" }}>
        ← Back to Leads
      </Link>
    </div>
  );
}
