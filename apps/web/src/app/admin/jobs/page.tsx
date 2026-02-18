"use client";

import React from "react";
import { apiFetch } from "@/admin/lib/api";
import { Badge, jobStatusTone } from "@/admin/ui/badges";
import { formatDateTime, formatMoney } from "@/admin/ui/format";
import { Notice } from "@/admin/ui/notice";
import { PageHeader, RowCard, Card, PrimaryButton, SecondaryButton, Pill } from "@/admin/ui/primitives";
import { AdminColors } from "@/admin/ui/theme";

type Contractor = {
  id: string;
  businessName: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
};

type Job = {
  id: string;
  status:
    | "DRAFT"
    | "PUBLISHED"
    | "OPEN_FOR_ROUTING"
    | "ASSIGNED"
    | "IN_PROGRESS"
    | "CONTRACTOR_COMPLETED"
    | "CUSTOMER_APPROVED"
    | "CUSTOMER_REJECTED"
    | "COMPLETION_FLAGGED"
    | "COMPLETED_APPROVED";
  title: string;
  region: string;
  serviceType: string;
  routerEarningsCents: number;
  brokerFeeCents: number;
  publishedAt: string;
  claimedAt: string | null;
  routedAt: string | null;
  assignment: { id: string; contractorId: string } | null;
  jobSource?: "MOCK" | "REAL" | "AI_REGENERATED";
  isMock?: boolean;
  publicStatus?: "OPEN" | "IN_PROGRESS";
  archived?: boolean;
};

type AdminJobStatusFilter =
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "CONTRACTOR_COMPLETED"
  | "CUSTOMER_APPROVED_AWAITING_ROUTER"
  | "CUSTOMER_REJECTED"
  | "FLAGGED_HOLD";

type CountryFilter = "" | "CA" | "US";
type DateRangeFilter = "1D" | "7D" | "30D" | "90D" | "ALL";

type TradeCategoryValue =
  | ""
  | "PLUMBING"
  | "ELECTRICAL"
  | "HVAC"
  | "APPLIANCE"
  | "HANDYMAN"
  | "PAINTING"
  | "CARPENTRY"
  | "DRYWALL"
  | "ROOFING"
  | "JANITORIAL_CLEANING"
  | "LANDSCAPING"
  | "FENCING"
  | "SNOW_REMOVAL"
  | "JUNK_REMOVAL"
  | "MOVING"
  | "FURNITURE_ASSEMBLY"
  | "AUTOMOTIVE";

const TRADE_CATEGORY_OPTIONS: Array<{ value: TradeCategoryValue; label: string }> = [
  { value: "", label: "All trades" },
  { value: "PLUMBING", label: "Plumbing" },
  { value: "ELECTRICAL", label: "Electrical" },
  { value: "HVAC", label: "HVAC (Light Duty)" },
  { value: "APPLIANCE", label: "Appliance Repair" },
  { value: "HANDYMAN", label: "Handyman" },
  { value: "PAINTING", label: "Painting" },
  { value: "CARPENTRY", label: "Carpentry (Light)" },
  { value: "DRYWALL", label: "Drywall" },
  { value: "ROOFING", label: "Roofing (Minor)" },
  { value: "JANITORIAL_CLEANING", label: "Janitorial & Cleaning" },
  { value: "LANDSCAPING", label: "Landscaping & Yard Work" },
  { value: "FENCING", label: "Fence Repair" },
  { value: "SNOW_REMOVAL", label: "Snow Removal" },
  { value: "JUNK_REMOVAL", label: "Junk Removal" },
  { value: "MOVING", label: "Light Moving" },
  { value: "FURNITURE_ASSEMBLY", label: "Furniture Assembly" },
  { value: "AUTOMOTIVE", label: "Automotive (Light)" },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];
const CA_PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"];

function adminStatusLabel(s: AdminJobStatusFilter) {
  if (s === "ASSIGNED") return "Assigned";
  if (s === "IN_PROGRESS") return "In progress";
  if (s === "CONTRACTOR_COMPLETED") return "Contractor completed";
  if (s === "CUSTOMER_APPROVED_AWAITING_ROUTER") return "Customer approved (awaiting router)";
  if (s === "CUSTOMER_REJECTED") return "Customer rejected";
  return "Flagged / hold";
}

function jobStatusLabel(s: Job["status"]) {
  if (s === "ASSIGNED") return "Assigned";
  if (s === "IN_PROGRESS") return "In progress";
  if (s === "CONTRACTOR_COMPLETED") return "Contractor completed";
  if (s === "CUSTOMER_APPROVED") return "Customer approved";
  if (s === "CUSTOMER_REJECTED") return "Customer rejected";
  if (s === "COMPLETION_FLAGGED") return "Flagged / hold";
  if (s === "COMPLETED_APPROVED") return "Completed approved";
  if (s === "OPEN_FOR_ROUTING") return "Open for routing";
  if (s === "PUBLISHED") return "Published";
  return s;
}

export default function JobsAdminPage() {
  const DEFAULT_FILTERS = React.useMemo(
    () => ({
      status: "ASSIGNED" as AdminJobStatusFilter,
      country: "" as CountryFilter,
      state: "" as string,
      city: "" as string,
      dateRange: "ALL" as DateRangeFilter,
      tradeCategory: "" as TradeCategoryValue,
    }),
    [],
  );

  const [filters, setFilters] = React.useState(DEFAULT_FILTERS);
  const [applied, setApplied] = React.useState(DEFAULT_FILTERS);

  const [jobs, setJobs] = React.useState<Job[]>([]);
  const [contractors, setContractors] = React.useState<Contractor[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [assigning, setAssigning] = React.useState<Record<string, string>>({});
  const [notice, setNotice] = React.useState<string>("");
  const [sortKey, setSortKey] = React.useState<"routedAt" | "title" | "status">("routedAt");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [bulkCountry, setBulkCountry] = React.useState<"US" | "CA">("CA");
  const [bulkRegionCode, setBulkRegionCode] = React.useState<string>("BC");
  const [bulkConfirm, setBulkConfirm] = React.useState<string>("");
  const [archiveTarget, setArchiveTarget] = React.useState<Job | null>(null);
  const [archiving, setArchiving] = React.useState<boolean>(false);

  type BulkAiJobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  type BulkAiJob = {
    id: string;
    kind: string;
    status: BulkAiJobStatus;
    totalJobs: number;
    processedJobs: number;
    adjusted: number;
    skipped: number;
    failed: number;
    startedAt: string | null;
    finishedAt: string | null;
    cancelledAt: string | null;
  };

  const [bulkModalOpen, setBulkModalOpen] = React.useState(false);
  const [bulkJobId, setBulkJobId] = React.useState<string>("");
  const [bulkJob, setBulkJob] = React.useState<BulkAiJob | null>(null);
  const [bulkJobError, setBulkJobError] = React.useState<string>("");
  const [bulkCanceling, setBulkCanceling] = React.useState<boolean>(false);
  const [mockControlsOpen, setMockControlsOpen] = React.useState(false);

  function buildJobsQuery(f: typeof applied): string {
    const qs = new URLSearchParams();
    qs.set("status", f.status);
    if (f.country) qs.set("country", f.country);
    if (f.state.trim()) qs.set("state", f.state.trim().toUpperCase());
    if (f.city.trim()) qs.set("city", f.city.trim());
    if (f.dateRange) qs.set("dateRange", f.dateRange);
    if (f.tradeCategory) qs.set("tradeCategory", f.tradeCategory);
    return qs.toString();
  }

  async function refresh(nextApplied?: typeof applied) {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const f = nextApplied ?? applied;
      const qs = buildJobsQuery(f);
      const [jobsResp, contractorsResp] = await Promise.all([
        apiFetch<{ ok: boolean; jobs: any[] }>(`/api/admin/jobs?${qs}`),
        apiFetch<{ contractors: Contractor[] }>(`/api/admin/contractors?status=APPROVED`),
      ]);
      setJobs((jobsResp as any).jobs as Job[]);
      setContractors(contractorsResp.contractors);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function archiveJob(jobId: string) {
    setArchiving(true);
    setError("");
    setNotice("");
    try {
      await apiFetch(`/api/admin/jobs/${jobId}/archive`, { method: "PATCH", body: JSON.stringify({}) });
      setArchiveTarget(null);
      await refresh();
      setNotice("Job archived. It is now hidden from the public site.");
    } catch {
      setError("Action failed. See server logs.");
    } finally {
      setArchiving(false);
    }
  }

  async function assign(jobId: string) {
    const contractorId = assigning[jobId];
    if (!contractorId) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      await apiFetch(`/api/admin/jobs/${jobId}/assign`, {
        method: "POST",
        body: JSON.stringify({ contractorId }),
      });
      await refresh();
      setNotice("Assignment recorded in audit logs.");
    } catch {
      setError("Action failed. See server logs.");
    } finally {
      setLoading(false);
    }
  }

  async function complete(jobId: string) {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      // eslint-disable-next-line no-alert
      const ok = window.confirm("Mark job complete? This credits the ledger and is logged.");
      if (!ok) return;
      await apiFetch(`/api/admin/jobs/${jobId}/complete`, { method: "POST" });
      await refresh();
      setNotice("Completion recorded. Ledger credits are written and logged.");
    } catch {
      setError("Action failed. See server logs.");
    } finally {
      setLoading(false);
    }
  }

  const sortedJobs = React.useMemo(() => {
    const copy = [...jobs];
    const dir = sortDir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      if (sortKey === "title") return a.title.localeCompare(b.title) * dir;
      if (sortKey === "status") return a.status.localeCompare(b.status) * dir;
      const at = a.routedAt ?? a.claimedAt ?? a.publishedAt ?? "";
      const bt = b.routedAt ?? b.claimedAt ?? b.publishedAt ?? "";
      return (new Date(at).getTime() - new Date(bt).getTime()) * dir;
    });
    return copy;
  }, [jobs, sortKey, sortDir]);

  const hasMockJobs = React.useMemo(() => {
    return (jobs ?? []).some((j) => Boolean(j.isMock) || j.jobSource === "MOCK");
  }, [jobs]);

  React.useEffect(() => {
    let alive = true;
    let timer: any = null;

    async function poll() {
      if (!bulkModalOpen || !bulkJobId) return;
      try {
        const data = await apiFetch<BulkAiJob>(`/api/admin/bulk-ai-jobs/${encodeURIComponent(bulkJobId)}/status`);
        if (!alive) return;
        setBulkJob(data);
      } catch {
        // ignore
      } finally {
        if (!alive) return;
        timer = setTimeout(poll, 4000);
      }
    }

    void poll();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [bulkModalOpen, bulkJobId]);

  const bulkTotal = bulkJob?.totalJobs ?? 0;
  const bulkProcessed = bulkJob?.processedJobs ?? 0;
  const bulkAdjusted = bulkJob?.adjusted ?? 0;
  const bulkSkipped = bulkJob?.skipped ?? 0;
  const bulkFailed = bulkJob?.failed ?? 0;
  const bulkStatus = bulkJob?.status ?? "";
  const bulkPct = bulkTotal > 0 ? Math.min(100, Math.round((bulkProcessed / bulkTotal) * 100)) : 0;

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <PageHeader
        eyebrow="Operations"
        title="Jobs"
        subtitle="Review routed jobs, assign approved contractors, and confirm completion. Financial actions are explicit and logged."
        right={<Pill label={loading ? "LOADING" : `${sortedJobs.length} JOBS`} tone="neutral" />}
      />

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 10, alignItems: "end" }}>
          <div style={{ gridColumn: "span 2" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: AdminColors.muted }}>Status</div>
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as AdminJobStatusFilter }))}
              style={{
                marginTop: 6,
                width: "100%",
                padding: 10,
                borderRadius: 12,
                border: `1px solid ${AdminColors.border}`,
                background: AdminColors.card,
                color: AdminColors.text,
              }}
            >
              {(
                [
                  "ASSIGNED",
                  "IN_PROGRESS",
                  "CONTRACTOR_COMPLETED",
                  "CUSTOMER_APPROVED_AWAITING_ROUTER",
                  "CUSTOMER_REJECTED",
                  "FLAGGED_HOLD",
                ] as AdminJobStatusFilter[]
              ).map((s) => (
                <option key={s} value={s}>
                  {adminStatusLabel(s)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: AdminColors.muted }}>Country</div>
            <select
              value={filters.country}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  country: e.target.value as CountryFilter,
                  state: "",
                }))
              }
              style={{
                marginTop: 6,
                width: "100%",
                padding: 10,
                borderRadius: 12,
                border: `1px solid ${AdminColors.border}`,
                background: AdminColors.card,
                color: AdminColors.text,
              }}
            >
              <option value="">All</option>
              <option value="CA">Canada</option>
              <option value="US">USA</option>
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: AdminColors.muted }}>State / Province</div>
            <select
              value={filters.state}
              onChange={(e) => setFilters((f) => ({ ...f, state: e.target.value }))}
              disabled={!filters.country}
              style={{
                marginTop: 6,
                width: "100%",
                padding: 10,
                borderRadius: 12,
                border: `1px solid ${AdminColors.border}`,
                background: AdminColors.card,
                color: AdminColors.text,
                opacity: filters.country ? 1 : 0.6,
              }}
            >
              <option value="">{filters.country ? "All" : "Select country first"}</option>
              {(filters.country === "CA" ? CA_PROVINCES : filters.country === "US" ? US_STATES : []).map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>

          <div style={{ gridColumn: "span 2" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: AdminColors.muted }}>City</div>
            <input
              value={filters.city}
              onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))}
              placeholder="Partial match (e.g. Vancouver)"
              style={{
                marginTop: 6,
                width: "100%",
                padding: 10,
                borderRadius: 12,
                border: `1px solid ${AdminColors.border}`,
                background: AdminColors.card,
                color: AdminColors.text,
              }}
            />
          </div>

          <div style={{ gridColumn: "span 2" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: AdminColors.muted }}>Date range</div>
            <select
              value={filters.dateRange}
              onChange={(e) => setFilters((f) => ({ ...f, dateRange: e.target.value as DateRangeFilter }))}
              style={{
                marginTop: 6,
                width: "100%",
                padding: 10,
                borderRadius: 12,
                border: `1px solid ${AdminColors.border}`,
                background: AdminColors.card,
                color: AdminColors.text,
              }}
            >
              <option value="1D">1 day</option>
              <option value="7D">7 days</option>
              <option value="30D">30 days</option>
              <option value="90D">90 days</option>
              <option value="ALL">All time</option>
            </select>
          </div>

          <div style={{ gridColumn: "span 2" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: AdminColors.muted }}>Trade category</div>
            <select
              value={filters.tradeCategory}
              onChange={(e) => setFilters((f) => ({ ...f, tradeCategory: e.target.value as TradeCategoryValue }))}
              style={{
                marginTop: 6,
                width: "100%",
                padding: 10,
                borderRadius: 12,
                border: `1px solid ${AdminColors.border}`,
                background: AdminColors.card,
                color: AdminColors.text,
              }}
            >
              {TRADE_CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ gridColumn: "span 2", display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <SecondaryButton
              disabled={
                loading ||
                (JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS) &&
                  JSON.stringify(applied) === JSON.stringify(DEFAULT_FILTERS))
              }
              onClick={() => {
                setFilters(DEFAULT_FILTERS);
                setApplied(DEFAULT_FILTERS);
                void refresh(DEFAULT_FILTERS);
              }}
            >
              Clear Filters
            </SecondaryButton>
            <PrimaryButton
              disabled={loading || JSON.stringify(filters) === JSON.stringify(applied)}
              onClick={() => {
                setApplied(filters);
                void refresh(filters);
              }}
            >
              Refresh
            </PrimaryButton>
          </div>
        </div>

        <div style={{ marginTop: 10, color: AdminColors.muted, fontSize: 12 }}>
          Active filters:{" "}
          <span style={{ color: AdminColors.text }}>
            {[
              `Status: ${adminStatusLabel(applied.status)}`,
              applied.country ? `Country: ${applied.country}` : "Country: All",
              applied.state ? `State: ${applied.state}` : null,
              applied.city.trim() ? `City: “${applied.city.trim()}”` : null,
              applied.dateRange === "ALL" ? "Date: All time" : `Date: ${applied.dateRange}`,
              applied.tradeCategory ? `Trade: ${applied.tradeCategory}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>

        {error ? <div style={{ color: AdminColors.danger, marginTop: 10 }}>{error}</div> : null}
        {notice ? <Notice text={notice} /> : null}
      </Card>

      <Card style={{ marginBottom: 14, background: AdminColors.graySoft, borderColor: AdminColors.divider }}>
        <button
          type="button"
          onClick={() => setMockControlsOpen((v) => !v)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          <div style={{ fontWeight: 900, color: AdminColors.text }}>Mock Job Controls</div>
          <div style={{ color: AdminColors.muted, fontSize: 12 }}>{mockControlsOpen ? "Hide" : "Show"}</div>
        </button>

        {mockControlsOpen ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {hasMockJobs ? (
                <PrimaryButton
                  disabled={loading || bulkStatus === "RUNNING"}
                  onClick={() => {
                    void (async () => {
                      try {
                        setError("");
                        setNotice("");
                        setBulkJobError("");
                        setBulkModalOpen(true);
                        setBulkJob(null);
                        setBulkJobId("");

                        const resp = await apiFetch<BulkAiJob>(`/api/admin/bulk-ai-jobs/start`, { method: "POST" });
                        setBulkJobId(resp.id);
                        setBulkJob(resp);
                      } catch {
                        setError("Action failed. See server logs.");
                        setBulkJobError("Action failed. See server logs.");
                      }
                    })();
                  }}
                >
                  {bulkStatus === "RUNNING" ? "Running AI appraisal…" : "Run AI Appraisal on All Mock Jobs"}
                </PrimaryButton>
              ) : null}
              <select
                value={bulkCountry}
                onChange={(e) => setBulkCountry(e.target.value as "US" | "CA")}
                style={{
                  padding: 10,
                  borderRadius: 12,
                  border: `1px solid ${AdminColors.border}`,
                  background: AdminColors.card,
                  color: AdminColors.text,
                }}
              >
                <option value="CA">Canada</option>
                <option value="US">United States</option>
              </select>
              <input
                value={bulkRegionCode}
                onChange={(e) => setBulkRegionCode(e.target.value.toUpperCase())}
                placeholder="Region code (e.g. BC, TX)"
                style={{
                  padding: 10,
                  borderRadius: 12,
                  border: `1px solid ${AdminColors.border}`,
                  background: AdminColors.card,
                  color: AdminColors.text,
                  width: 220,
                }}
              />
              <input
                value={bulkConfirm}
                onChange={(e) => setBulkConfirm(e.target.value)}
                placeholder="Type DELETE to confirm"
                style={{
                  padding: 10,
                  borderRadius: 12,
                  border: `1px solid ${AdminColors.border}`,
                  background: AdminColors.card,
                  color: AdminColors.text,
                  width: 220,
                }}
              />
              <SecondaryButton
                onClick={() => {
                  void (async () => {
                    try {
                      setLoading(true);
                      setError("");
                      setNotice("");
                      if (bulkConfirm.trim().toUpperCase() !== "DELETE") {
                        setError("Type DELETE to confirm bulk deletion.");
                        return;
                      }
                      const rc = bulkRegionCode.trim().toUpperCase();
                      if (rc.length !== 2) {
                        setError("Region code must be 2 characters (e.g. BC, TX).");
                        return;
                      }
                      const resp = await apiFetch<{
                        ok: boolean;
                        regionCode: string;
                        deletedJobs: number;
                        deletedPhotos: number;
                      }>(`/api/admin/jobs/bulk-delete-mocks`, {
                        method: "POST",
                        body: JSON.stringify({ country: bulkCountry, regionCode: rc }),
                      });
                      setNotice(
                        `Deleted ${resp.deletedJobs} mock jobs in ${bulkCountry}-${resp.regionCode} (photos: ${resp.deletedPhotos}).`
                      );
                      setBulkConfirm("");
                      await refresh();
                    } catch {
                      setError("Action failed. See server logs.");
                    } finally {
                      setLoading(false);
                    }
                  })();
                }}
                disabled={loading}
              >
                Bulk delete mock jobs
              </SecondaryButton>
            </div>
            <div style={{ marginTop: 8, color: AdminColors.muted, fontSize: 12 }}>
              Deletes only jobs where <strong>isMock=true</strong> for the selected region.
            </div>
          </div>
        ) : null}
      </Card>

      {bulkModalOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 50,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              background: AdminColors.card,
              border: `1px solid ${AdminColors.border}`,
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 30px 90px rgba(0,0,0,0.25)",
              pointerEvents: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 900, color: AdminColors.text, fontSize: 16 }}>
                  {bulkStatus === "COMPLETED"
                    ? "Completed"
                    : bulkStatus === "FAILED"
                      ? "Failed"
                      : bulkStatus === "CANCELLED"
                        ? "Cancelled"
                        : "Running AI Appraisal"}
                </div>
                <div style={{ marginTop: 4, color: AdminColors.muted, fontSize: 12 }}>
                  Progress updates every few seconds. You can close this modal at any time.
                </div>
              </div>
              <Badge
                label={bulkStatus || "—"}
                tone={
                  bulkStatus === "COMPLETED"
                    ? "ok"
                    : bulkStatus === "FAILED"
                      ? "danger"
                      : bulkStatus === "CANCELLED"
                        ? "warn"
                        : "info"
                }
              />
            </div>

            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  height: 10,
                  borderRadius: 999,
                  background: AdminColors.graySoft,
                  border: `1px solid ${AdminColors.border}`,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${bulkPct}%`,
                    background:
                      bulkStatus === "FAILED"
                        ? "#ef4444"
                        : bulkStatus === "CANCELLED"
                          ? "#f59e0b"
                          : AdminColors.green,
                    transition: "width 250ms ease",
                  }}
                />
              </div>
              <div style={{ marginTop: 8, color: AdminColors.text, fontWeight: 900 }}>
                {bulkProcessed.toLocaleString()} / {bulkTotal.toLocaleString()} jobs processed
              </div>
              <div style={{ marginTop: 6, color: AdminColors.muted, fontSize: 12, display: "grid", gap: 4 }}>
                <div>Adjusted: {bulkAdjusted.toLocaleString()}</div>
                <div>Skipped: {bulkSkipped.toLocaleString()}</div>
                <div>Failed: {bulkFailed.toLocaleString()}</div>
              </div>
            </div>

            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              {bulkStatus === "RUNNING" ? (
                <SecondaryButton
                  disabled={bulkCanceling || !bulkJobId}
                  onClick={() => {
                    void (async () => {
                      try {
                        setBulkCanceling(true);
                        setBulkJobError("");
                        await apiFetch(`/api/admin/bulk-ai-jobs/${encodeURIComponent(bulkJobId)}/cancel`, {
                          method: "POST",
                          body: JSON.stringify({}),
                        });
                        const refreshed = await apiFetch<BulkAiJob>(
                          `/api/admin/bulk-ai-jobs/${encodeURIComponent(bulkJobId)}/status`,
                        );
                        setBulkJob(refreshed);
                      } catch (e) {
                        setBulkJobError(e instanceof Error ? e.message : "Cancel failed");
                      } finally {
                        setBulkCanceling(false);
                      }
                    })();
                  }}
                >
                  {bulkCanceling ? "Cancelling…" : "Cancel Run"}
                </SecondaryButton>
              ) : null}
              <SecondaryButton
                onClick={() => {
                  setBulkModalOpen(false);
                  setBulkJobId("");
                  setBulkJob(null);
                  void refresh();
                }}
              >
                Close
              </SecondaryButton>
            </div>

            {bulkJobError ? <div style={{ marginTop: 10, color: AdminColors.danger, fontSize: 12 }}>{bulkJobError}</div> : null}
          </div>
        </div>
      ) : null}

      {archiveTarget ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 60,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              background: AdminColors.card,
              border: `1px solid ${AdminColors.border}`,
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 30px 90px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ fontWeight: 900, color: AdminColors.text, fontSize: 16 }}>Archive this job?</div>
            <div style={{ marginTop: 8, color: AdminColors.muted, fontSize: 13, lineHeight: "20px" }}>
              Archive this job? It will be removed from the public site but kept for records.
            </div>
            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <SecondaryButton disabled={archiving} onClick={() => setArchiveTarget(null)}>
                Cancel
              </SecondaryButton>
              <SecondaryButton disabled={archiving} onClick={() => void archiveJob(archiveTarget.id)}>
                {archiving ? "Archiving…" : "Archive"}
              </SecondaryButton>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 10 }}>
        {sortedJobs.map((j) => (
          <RowCard key={j.id} style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 320, flex: 1 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <a
                    href={`/admin/jobs/${j.id}`}
                    style={{ fontSize: 16, fontWeight: 900, color: AdminColors.text, textDecoration: "none" }}
                  >
                    {j.title}
                  </a>
                  <Badge label={jobStatusLabel(j.status)} tone={jobStatusTone(j.status)} />
                  {j.jobSource ? <Badge label={j.jobSource} tone={j.jobSource === "MOCK" ? "warn" : "ok"} /> : null}
                  {j.archived ? <Badge label="ARCHIVED" tone="neutral" /> : null}
                </div>
                <div style={{ color: AdminColors.muted, marginTop: 6, fontSize: 13, lineHeight: "20px" }}>
                  {j.region} • {j.serviceType} • Router{" "}
                  <span style={{ color: AdminColors.green, fontWeight: 900 }}>
                    {formatMoney(j.routerEarningsCents, ((j as any).currency ?? "USD") as any)}
                  </span>{" "}
                  • Broker {formatMoney(j.brokerFeeCents, ((j as any).currency ?? "USD") as any)}
                </div>
                <div style={{ color: AdminColors.muted, marginTop: 10, fontSize: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span>Published: {formatDateTime(j.publishedAt)}</span>
                  <span>Routed: {formatDateTime(j.routedAt)}</span>
                  <span>Assigned: {j.assignment ? "Yes" : "No"}</span>
                </div>
              </div>

              <div style={{ minWidth: 340, display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
                {j.status === "PUBLISHED" && !j.archived ? (
                  <>
                    <select
                      value={assigning[j.id] ?? ""}
                      onChange={(e) => setAssigning((prev) => ({ ...prev, [j.id]: e.target.value }))}
                      style={{
                        padding: 10,
                        borderRadius: 12,
                        border: `1px solid ${AdminColors.border}`,
                        background: AdminColors.card,
                        color: AdminColors.text,
                        minWidth: 200,
                      }}
                    >
                      <option value="">Select contractor…</option>
                      {contractors.map((c) => (
                        <option key={c?.id ?? ""} value={c?.id ?? ""}>
                          {c?.businessName ?? "—"}
                        </option>
                      ))}
                    </select>
                    <PrimaryButton disabled={loading || !(assigning[j.id] ?? "")} onClick={() => void assign(j.id)}>
                      Assign
                    </PrimaryButton>
                  </>
                ) : null}

                {!j.archived ? (
                  <SecondaryButton disabled={loading} onClick={() => setArchiveTarget(j)}>
                    Archive
                  </SecondaryButton>
                ) : null}
                <SecondaryButton onClick={() => (window.location.href = `/admin/jobs/${j.id}`)}>View</SecondaryButton>
              </div>
            </div>
          </RowCard>
        ))}

        {sortedJobs.length === 0 ? (
          <Card>
            <div style={{ color: AdminColors.muted }}>No jobs found.</div>
          </Card>
        ) : null}
      </div>
    </main>
  );
}

