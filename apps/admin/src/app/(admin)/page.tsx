import { redirect } from "next/navigation";
import { adminApiFetch } from "@/server/adminApi";
import styles from "./overview.module.css";

type JobsStatusResp = {
  activeJobs: number;
  awaitingRouter: number;
  unassignedOver24h: number;
  adminOwnedJobs: number;
  jobs: Array<{
    id: string;
    title: string | null;
    status: string;
    regionName: string;
    region: string;
    location: string;
    routingStatus: string;
    createdAt: string;
    publishedAt: string;
  }>;
};

type DashboardResp = {
  jobs: { available: number; awaitingAssignment: number; assigned: number; completed: number };
  contractors: { pendingApproval: number; active: number; suspended: number };
  money: { pendingPayouts: number; feesCollected: { todayCents: number; weekCents: number } };
  alerts: { stalledJobsRoutedOver24h: number; stalledAssignmentsOver72h: number; failedPayouts: number };
};

type ContractorSignup = {
  userId: string;
  status: string | null;
  wizardCompleted: boolean;
  waiverAccepted: boolean;
  waiverAcceptedAt: string | null;
  tradeCategory: string | null;
  country: string | null;
  regionCode: string | null;
  city: string | null;
  createdAt: string;
  user: { email: string | null; name: string | null; role: string; status: string; createdAt: string };
};

type ContractorsResp = { contractors: ContractorSignup[]; nextCursor: string | null };

type SupportTicket = {
  id: string;
  type: string;
  status: string;
  category: string;
  priority: string;
  subject: string | null;
  updatedAt: string;
  messageCount: number;
};

type SupportTicketsResp = { tickets: SupportTicket[] };

type Dispute = {
  id: string;
  status: string;
  disputeReason: string;
  againstRole: string;
  jobId: string;
  deadlineAt: string;
  ticket: { subject: string | null; priority: string | null; category: string | null; status: string | null };
};

type DisputesResp = { disputes: Dispute[] };

type StripeRevenueResp = {
  stripeRevenue: { lifetimeCents: number; monthCents: number; todayCents: number };
  pendingPayoutBalanceCents: number;
};

type VisualIntegrityResp = {
  totalJobs: number;
  images: { withImages: number; pctWithImages: number };
  titles: {
    humanized: number;
    pctHumanized: number;
    sampleSize: number;
    sampled: boolean;
    threshold: { scoreGte: number; flagsMustBeEmpty: boolean };
  };
  jobsOlderThanXDays: { ageDays: number; count: number };
  unroutedJobs: number;
  jobsMissingDescription: number;
  jobsMissingTrade: number;
};

function parseIso(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(String(s));
  return Number.isNaN(d.getTime()) ? null : d;
}

function ageMs(d: Date | null): number | null {
  if (!d) return null;
  return Date.now() - d.getTime();
}

function fmtAge(ms: number | null): string {
  if (ms == null) return "—";
  const totalMins = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function fmtDelta(ms: number | null): string {
  if (ms == null) return "—";
  const abs = Math.abs(ms);
  const core = fmtAge(abs);
  if (ms < 0) return `in ${core}`;
  return `overdue ${core}`;
}

function fmtMoney(cents: number): string {
  const v = (Number(cents || 0) / 100).toFixed(2);
  return `$${v}`;
}

async function actAsRouter(formData: FormData) {
  "use server";
  const jobId = String(formData.get("jobId") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();
  if (!jobId) return;
  try {
    await adminApiFetch(`/api/admin/jobs/${encodeURIComponent(jobId)}/assign-me-as-router`, { method: "POST" });
  } catch {
    // Keep UX deterministic: redirect back; errors will render as counts unchanged.
  }
  redirect(region ? `/?region=${encodeURIComponent(region)}` : "/");
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const selectedRegion = String(Array.isArray(sp.region) ? sp.region[0] : sp.region ?? "").trim().toUpperCase();
  const selectedContractorRegion = String(Array.isArray(sp.cRegion) ? sp.cRegion[0] : sp.cRegion ?? "").trim().toUpperCase();
  const ageDaysRaw = String(Array.isArray(sp.ageDays) ? sp.ageDays[0] : sp.ageDays ?? "14");
  const ageDays = Math.max(1, Math.min(365, Number(ageDaysRaw) || 14));

  let dashboard: DashboardResp | null = null;
  let jobsStatus: JobsStatusResp | null = null;
  let contractors: ContractorsResp | null = null;
  let tickets: SupportTicketsResp | null = null;
  let disputes: DisputesResp | null = null;
  let revenue: StripeRevenueResp | null = null;
  let visual: VisualIntegrityResp | null = null;
  let fatalAuthError: string | null = null;

  try {
    // Parallel fetches (server-side). All are DB-authoritative via apps/api internal admin headers.
    [dashboard, jobsStatus, contractors, tickets, disputes, revenue, visual] = await Promise.all([
      adminApiFetch<DashboardResp>("/api/admin/dashboard").catch(() => null),
      adminApiFetch<JobsStatusResp>("/api/admin/jobs/status?limit=200").catch(() => null),
      adminApiFetch<ContractorsResp>("/api/admin/users/contractors").catch(() => null),
      adminApiFetch<SupportTicketsResp>("/api/admin/support/tickets?take=20").catch(() => null),
      adminApiFetch<DisputesResp>("/api/admin/support/disputes?take=20").catch(() => null),
      adminApiFetch<StripeRevenueResp>("/api/admin/stripe/revenue").catch(() => null),
      adminApiFetch<VisualIntegrityResp>(`/api/admin/jobs/visual-integrity?ageDays=${encodeURIComponent(String(ageDays))}`).catch(() => null),
    ]);
  } catch (e) {
    // Missing INTERNAL_SECRET / ADMIN_ID throws synchronously inside adminApiFetch.
    fatalAuthError = e instanceof Error ? e.message : "Admin auth not configured";
  }

  const jobs = jobsStatus?.jobs ?? [];
  const regions = Array.from(
    new Set(
      jobs
        .map((j) => String(j.region || j.regionName || "").trim().toUpperCase())
        .filter(Boolean),
    ),
  ).sort();

  const effectiveRegion = selectedRegion && regions.includes(selectedRegion) ? selectedRegion : "";
  const jobsFiltered = effectiveRegion ? jobs.filter((j) => String(j.region ?? "").toUpperCase() === effectiveRegion) : jobs;

  const unroutedOver24h = jobsFiltered.filter((j) => {
    const published = parseIso(j.publishedAt) ?? parseIso(j.createdAt);
    const ms = ageMs(published);
    const routed = j.routingStatus === "ROUTED_BY_ROUTER" || j.routingStatus === "ROUTED_BY_ADMIN";
    const isPublished = String(j.status ?? "") === "PUBLISHED";
    return isPublished && !routed && ms != null && ms > 24 * 60 * 60 * 1000;
  });

  const contractorRows = contractors?.contractors ?? [];
  const contractorRegions = Array.from(
    new Set(contractorRows.map((c) => String(c.regionCode ?? "").trim().toUpperCase()).filter(Boolean)),
  ).sort();
  const effectiveCRegion =
    selectedContractorRegion && contractorRegions.includes(selectedContractorRegion) ? selectedContractorRegion : "";
  const contractorFiltered = effectiveCRegion
    ? contractorRows.filter((c) => String(c.regionCode ?? "").toUpperCase() === effectiveCRegion)
    : contractorRows;

  const ticketRows = tickets?.tickets ?? [];
  const ticketCounts = ticketRows.reduce<Record<string, number>>((acc, t) => {
    const k = String(t.status ?? "UNKNOWN");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  const disputeRows = disputes?.disputes ?? [];
  const activeDisputes = disputeRows.filter((d) => !["DECIDED", "CLOSED"].includes(String(d.status)));

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Overview</h1>
      <p className={styles.subtitle}>
        Command Center view. Metrics are pulled server-side from <code>apps/api</code> admin endpoints using internal admin
        headers.
      </p>

      {fatalAuthError ? (
        <Card title="Admin auth not configured">
          <div style={{ color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{fatalAuthError}</div>
          <div style={{ marginTop: 8, color: "rgba(226,232,240,0.72)" }}>
            Set <code>INTERNAL_SECRET</code> and <code>ADMIN_ID</code> in <code>apps/admin/.env.local</code>, and ensure{" "}
            <code>apps/api</code> is running with the same <code>INTERNAL_SECRET</code>.
          </div>
        </Card>
      ) : null}

      {/* KPI grid */}
      <div className={styles.gridKpi}>
        <Card title="Jobs (available)">
          <div className={styles.kpiValue}>{dashboard?.jobs.available ?? "—"}</div>
          <div className={styles.muted}>Published, not archived</div>
        </Card>
        <Card title="Pending payouts">
          <div className={styles.kpiValue}>{dashboard?.money.pendingPayouts ?? "—"}</div>
          <div className={styles.muted}>Balance: {revenue ? fmtMoney(revenue.pendingPayoutBalanceCents) : "—"}</div>
        </Card>
        <Card title="Support tickets">
          <div className={styles.kpiValue}>{ticketRows.length || "—"}</div>
          <div className={styles.muted}>
            Open: {ticketCounts.OPEN ?? 0} · In progress: {ticketCounts.IN_PROGRESS ?? 0}
          </div>
        </Card>
        <Card title="Stripe revenue">
          <div className={styles.kpiValue}>{revenue ? fmtMoney(revenue.stripeRevenue.todayCents) : "—"}</div>
          <div className={styles.muted}>
            Month: {revenue ? fmtMoney(revenue.stripeRevenue.monthCents) : "—"} · Lifetime:{" "}
            {revenue ? fmtMoney(revenue.stripeRevenue.lifetimeCents) : "—"}
          </div>
        </Card>
      </div>

      {/* Quality health */}
      <div style={{ marginTop: 24 }}>
        <Card title="Visual integrity (quality health)">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 950 }}>{visual ? `${visual.images.pctWithImages}%` : "—"}</div>
              <div style={{ marginTop: 4, color: "rgba(226,232,240,0.72)" }}>% Jobs with Images</div>
              <div style={{ marginTop: 8 }}>
                <a href="/jobs/image-audit" style={linkStyle}>
                  Open Image Audit →
                </a>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 950 }}>{visual ? `${visual.titles.pctHumanized}%` : "—"}</div>
              <div style={{ marginTop: 4, color: "rgba(226,232,240,0.72)" }}>% Humanized Titles</div>
              <div style={{ marginTop: 6, color: "rgba(226,232,240,0.60)", fontSize: 12 }}>
                {visual?.titles.sampled ? `sampled (${visual.titles.sampleSize})` : `all (${visual?.titles.sampleSize ?? "—"})`}
              </div>
              <div style={{ marginTop: 8 }}>
                <a href="/jobs/title-audit" style={linkStyle}>
                  Open Title Audit →
                </a>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 950 }}>{visual ? visual.jobsOlderThanXDays.count : "—"}</div>
              <div style={{ marginTop: 4, color: "rgba(226,232,240,0.72)" }}>
                Jobs older than {visual ? visual.jobsOlderThanXDays.ageDays : ageDays} days
              </div>
              <form method="GET" style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input name="ageDays" defaultValue={String(ageDays)} style={{ ...inputStyle, minWidth: 120 }} />
                {effectiveRegion ? <input type="hidden" name="region" value={effectiveRegion} /> : null}
                {effectiveCRegion ? <input type="hidden" name="cRegion" value={effectiveCRegion} /> : null}
                <button type="submit" style={buttonStyle}>
                  Update
                </button>
              </form>
            </div>
          </div>

          <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 950 }}>{visual ? visual.unroutedJobs : "—"}</div>
              <div style={{ marginTop: 4, color: "rgba(226,232,240,0.72)" }}>Unrouted jobs</div>
              <div style={{ marginTop: 6, color: "rgba(226,232,240,0.60)", fontSize: 12 }}>Published + UNROUTED</div>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 950 }}>{visual ? visual.jobsMissingDescription : "—"}</div>
              <div style={{ marginTop: 4, color: "rgba(226,232,240,0.72)" }}>Jobs missing description</div>
              <div style={{ marginTop: 8 }}>
                <a href="/jobs/description-audit" style={linkStyle}>
                  Open Description Audit →
                </a>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 950 }}>{visual ? visual.jobsMissingTrade : "—"}</div>
              <div style={{ marginTop: 4, color: "rgba(226,232,240,0.72)" }}>Jobs missing trade</div>
              <div style={{ marginTop: 6, color: "rgba(226,232,240,0.60)", fontSize: 12 }}>null/empty tradeCategory</div>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 950 }}>{visual ? visual.totalJobs : "—"}</div>
              <div style={{ marginTop: 4, color: "rgba(226,232,240,0.72)" }}>Total jobs (non-mock)</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Latest jobs + escalations */}
      <div className={styles.grid2}>
        <Card title="Latest jobs by State/Province">
          <form method="GET" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: "rgba(226,232,240,0.72)" }}>Region</label>
            <select name="region" defaultValue={effectiveRegion} style={selectStyle} aria-label="Select region">
              <option value="">All</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {effectiveCRegion ? <input type="hidden" name="cRegion" value={effectiveCRegion} /> : null}
            <button type="submit" style={buttonStyle}>
              Apply
            </button>
          </form>

          <Table
            head={["Age", "Status", "Routing", "Title", "Location"]}
            rows={jobsFiltered.slice(0, 12).map((j) => {
              const published = parseIso(j.publishedAt) ?? parseIso(j.createdAt);
              const ms = ageMs(published);
              const routed = j.routingStatus === "ROUTED_BY_ROUTER" || j.routingStatus === "ROUTED_BY_ADMIN";
              const isPublished = String(j.status ?? "") === "PUBLISHED";
              const overdue = isPublished && !routed && ms != null && ms > 24 * 60 * 60 * 1000;
              return {
                key: j.id,
                danger: overdue,
                cols: [
                  fmtAge(ms),
                  String(j.status ?? ""),
                  routed ? String(j.routingStatus) : "UNROUTED",
                  String(j.title ?? "—"),
                  String(j.location ?? j.regionName ?? j.region ?? "—"),
                ],
              };
            })}
          />
        </Card>

        <Card title="Pending job escalations">
          <div style={{ color: "rgba(226,232,240,0.72)", fontSize: 12 }}>
            Jobs &gt; 24h <b>unrouted</b> (computed server-side).
          </div>

          <div style={{ marginTop: 10 }}>
            {unroutedOver24h.length === 0 ? (
              <div style={{ color: "rgba(226,232,240,0.72)" }}>No escalations.</div>
            ) : (
              <Table
                head={["Age", "Region", "Title", "Action"]}
                rows={unroutedOver24h.slice(0, 10).map((j) => {
                  const published = parseIso(j.publishedAt) ?? parseIso(j.createdAt);
                  const ms = ageMs(published);
                  return {
                    key: j.id,
                    danger: true,
                    cols: [
                      fmtAge(ms),
                      String(j.region ?? "—"),
                      String(j.title ?? "—"),
                      <form key={j.id} action={actAsRouter}>
                        <input type="hidden" name="jobId" value={j.id} />
                        {effectiveRegion ? <input type="hidden" name="region" value={effectiveRegion} /> : null}
                        <button type="submit" style={miniDangerButtonStyle}>
                          Act as Router
                        </button>
                      </form>,
                    ],
                  };
                })}
              />
            )}
          </div>
        </Card>
      </div>

      {/* Contractors + tickets + disputes */}
      <div className={styles.grid3}>
        <Card title="Latest contractors signed-up">
          <form method="GET" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: "rgba(226,232,240,0.72)" }}>Region</label>
            <select name="cRegion" defaultValue={effectiveCRegion} style={selectStyle} aria-label="Select contractor region">
              <option value="">All</option>
              {contractorRegions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {effectiveRegion ? <input type="hidden" name="region" value={effectiveRegion} /> : null}
            <button type="submit" style={buttonStyle}>
              Apply
            </button>
          </form>

          <Table
            head={["Age", "Region", "Wizard", "Waiver", "Email"]}
            rows={contractorFiltered.slice(0, 12).map((c) => {
              const d = parseIso(c.createdAt);
              const ms = ageMs(d);
              const wizard = c.wizardCompleted ? "✅" : "—";
              const waiver = c.waiverAccepted ? "✅" : "—";
              return {
                key: c.userId,
                cols: [fmtAge(ms), String(c.regionCode ?? "—"), wizard, waiver, String(c.user?.email ?? "—")],
              };
            })}
          />
        </Card>

        <Card title="Support ticket summary">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.keys(ticketCounts).length === 0 ? (
              <div style={{ color: "rgba(226,232,240,0.72)" }}>No data.</div>
            ) : (
              Object.entries(ticketCounts).map(([k, v]) => (
                <span key={k} style={pillStyle}>
                  {k}: <b style={{ marginLeft: 6 }}>{v}</b>
                </span>
              ))
            )}
          </div>
          <div style={{ marginTop: 10 }}>
            <Table
              head={["Priority", "Status", "Updated", "Subject"]}
              rows={ticketRows.slice(0, 8).map((t) => ({
                key: t.id,
                cols: [t.priority, t.status, fmtAge(ageMs(parseIso(t.updatedAt))), String(t.subject ?? "—")],
              }))}
            />
          </div>
        </Card>

        <Card title="Active disputes">
          <div style={{ color: "rgba(226,232,240,0.72)", fontSize: 12 }}>Showing non-decided disputes.</div>
          <div style={{ marginTop: 10 }}>
            {activeDisputes.length === 0 ? (
              <div style={{ color: "rgba(226,232,240,0.72)" }}>No active disputes.</div>
            ) : (
              <Table
                head={["Deadline", "Status", "Reason", "Job"]}
                rows={activeDisputes.slice(0, 8).map((d) => ({
                  key: d.id,
                  cols: [
                    (() => {
                      const dl = parseIso(d.deadlineAt);
                      if (!dl) return "—";
                      const ms = Date.now() - dl.getTime();
                      return fmtDelta(ms);
                    })(),
                    d.status,
                    d.disputeReason,
                    d.jobId,
                  ],
                }))}
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Card(props: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>{props.title}</div>
      <div className={styles.cardBody}>{props.children}</div>
    </div>
  );
}

function Table(props: {
  head: React.ReactNode[];
  rows: Array<{ key: string; cols: React.ReactNode[]; danger?: boolean }>;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
        <thead>
          <tr>
            {props.head.map((h, i) => (
              <th
                key={i}
                style={{
                  textAlign: "left",
                  fontSize: 12,
                  color: "rgba(226,232,240,0.70)",
                  fontWeight: 900,
                  padding: "10px 10px",
                  borderBottom: "1px solid rgba(148,163,184,0.12)",
                  whiteSpace: "nowrap",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((r) => (
            <tr key={r.key} style={{ background: r.danger ? "rgba(248,113,113,0.08)" : "transparent" }}>
              {r.cols.map((c, i) => (
                <td
                  key={i}
                  style={{
                    padding: "10px 10px",
                    borderBottom: "1px solid rgba(148,163,184,0.08)",
                    color: "rgba(226,232,240,0.90)",
                    fontSize: 13,
                    whiteSpace: "nowrap",
                  }}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
          {props.rows.length === 0 ? (
            <tr>
              <td colSpan={props.head.length} style={{ padding: 10, color: "rgba(226,232,240,0.65)" }}>
                No data.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: "rgba(2,6,23,0.35)",
  border: "1px solid rgba(148,163,184,0.14)",
  color: "rgba(226,232,240,0.92)",
  borderRadius: 12,
  padding: "8px 10px",
  fontSize: 13,
};

const inputStyle: React.CSSProperties = {
  ...selectStyle,
  minWidth: 240,
};

const buttonStyle: React.CSSProperties = {
  background: "rgba(34,197,94,0.16)",
  border: "1px solid rgba(34,197,94,0.35)",
  color: "rgba(134,239,172,0.95)",
  borderRadius: 12,
  padding: "8px 10px",
  fontSize: 13,
  fontWeight: 900,
  cursor: "pointer",
};

const linkStyle: React.CSSProperties = {
  color: "rgba(56,189,248,0.95)",
  textDecoration: "none",
  fontWeight: 900,
};

const miniDangerButtonStyle: React.CSSProperties = {
  background: "rgba(248,113,113,0.16)",
  border: "1px solid rgba(248,113,113,0.30)",
  color: "rgba(254,202,202,0.95)",
  borderRadius: 12,
  padding: "7px 10px",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.14)",
  background: "rgba(2,6,23,0.25)",
  color: "rgba(226,232,240,0.85)",
  fontSize: 12,
  fontWeight: 800,
};

