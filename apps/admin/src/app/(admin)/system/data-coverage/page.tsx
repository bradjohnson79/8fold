import { adminApiFetch } from "@/server/adminApiV4";

type CoverageResp = {
  users: {
    total: number;
    byRole: { JOB_POSTER: number; CONTRACTOR: number; ROUTER: number; ADMIN: number };
    active: number;
    inactive: number;
  };
  jobPosters: {
    total: number;
  };
  jobs: {
    total: number;
    byStatus: {
      PUBLISHED: number;
      OPEN_FOR_ROUTING: number;
      ROUTING_IN_PROGRESS: number;
      ASSIGNED: number;
      IN_PROGRESS: number;
      COMPLETED: number;
    };
    mock: number;
    real: number;
  };
  contractors: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
    stripeConnected: number;
    stripeVerified: number;
  };
  routers: {
    total: number;
    stripeConnected: number;
    stripeVerified: number;
  };
  invites: {
    total: number;
    pending: number;
    accepted: number;
    declined: number;
    autoDeclined: number;
  };
  integrityWarnings: string[];
  unknownRoles?: string[];
  dbIdentity: {
    database: string | null;
    schema: string | null;
    hostMasked: string | null;
    environment: string;
  };
};

type HealthTone = "healthy" | "warning" | "critical";

function tonePill(tone: HealthTone, label: string) {
  const style =
    tone === "healthy"
      ? { border: "1px solid rgba(34,197,94,0.35)", background: "rgba(34,197,94,0.12)", color: "rgba(134,239,172,0.95)" }
      : tone === "warning"
        ? { border: "1px solid rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.12)", color: "rgba(253,230,138,0.95)" }
        : { border: "1px solid rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.12)", color: "rgba(254,202,202,0.95)" };
  return (
    <span style={{ ...style, borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 900 }}>
      {label}
    </span>
  );
}

function sectionTone(total: number, warning = false): HealthTone {
  if (total === 0) return "critical";
  if (warning) return "warning";
  return "healthy";
}

function Card(props: { title: string; tone: HealthTone; children: React.ReactNode }) {
  return (
    <section
      style={{
        border: "1px solid rgba(148,163,184,0.16)",
        background: "rgba(2,6,23,0.30)",
        borderRadius: 16,
        padding: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 950 }}>{props.title}</h2>
        {tonePill(props.tone, toneLabel(props.tone))}
      </div>
      <div style={{ marginTop: 10 }}>{props.children}</div>
    </section>
  );
}

function toneLabel(tone: HealthTone): string {
  if (tone === "healthy") return "Healthy";
  if (tone === "warning") return "Warning";
  return "Critical";
}

function kv(label: string, value: React.ReactNode) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", fontSize: 13 }}>
      <div style={{ color: "rgba(226,232,240,0.72)", fontWeight: 700 }}>{label}</div>
      <div style={{ color: "rgba(226,232,240,0.92)", fontWeight: 900 }}>{value}</div>
    </div>
  );
}

export default async function DataCoveragePage() {
  let data: CoverageResp | null = null;
  let error: string | null = null;

  try {
    data = await adminApiFetch<CoverageResp>("/api/admin/v4/coverage");
  } catch (e) {
    const status = typeof (e as any)?.status === "number" ? (e as any).status : null;
    const message = e instanceof Error ? e.message : "Failed to load data coverage";
    error = `Data Coverage request failed${status ? ` (HTTP ${status})` : ""}: ${message}`;
  }

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>System Data Coverage</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)" }}>
        Live DB integrity dashboard for entity coverage, status distribution, and routing/Stripe alignment.
      </p>

      {error ? (
        <div style={{ marginTop: 12, border: "1px solid rgba(248,113,113,0.35)", borderRadius: 14, padding: 12, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>
          {error}
        </div>
      ) : null}

      {data ? (
        <>
          <div style={{ marginTop: 12, border: "1px solid rgba(148,163,184,0.16)", background: "rgba(2,6,23,0.30)", borderRadius: 16, padding: 14 }}>
            <div style={{ fontWeight: 900 }}>System Health Header</div>
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {tonePill(sectionTone(data.users.total), `Users ${data.users.total}`)}
              {tonePill(sectionTone(data.jobPosters.total), `Job Posters ${data.jobPosters.total}`)}
              {tonePill(sectionTone(data.jobs.total), `Jobs ${data.jobs.total}`)}
              {tonePill(sectionTone(data.contractors.total, data.contractors.stripeConnected === 0 && data.contractors.total > 0), `Contractors ${data.contractors.total}`)}
              {tonePill(sectionTone(data.routers.total), `Routers ${data.routers.total}`)}
              {tonePill(sectionTone(data.invites.total), `Invites ${data.invites.total}`)}
            </div>

            {data.integrityWarnings.length > 0 ? (
              <div style={{ marginTop: 10, border: "1px solid rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.10)", borderRadius: 12, padding: 10 }}>
                <div style={{ fontWeight: 900, color: "rgba(253,230,138,0.95)" }}>Integrity Warnings</div>
                <ul style={{ margin: "8px 0 0 18px", color: "rgba(253,230,138,0.95)" }}>
                  {data.integrityWarnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
            <Card title="Users" tone={sectionTone(data.users.total)}>
              {kv("Total", data.users.total)}
              {kv("JOB_POSTER", data.users.byRole.JOB_POSTER)}
              {kv("CONTRACTOR", data.users.byRole.CONTRACTOR)}
              {kv("ROUTER", data.users.byRole.ROUTER)}
              {kv("ADMIN", data.users.byRole.ADMIN)}
              {kv("Active", data.users.active)}
              {kv("Inactive", data.users.inactive)}
            </Card>

            <Card title="Jobs" tone={sectionTone(data.jobs.total, data.jobs.total > 0 && data.users.byRole.JOB_POSTER === 0)}>
              {kv("Total", data.jobs.total)}
              {kv("PUBLISHED", data.jobs.byStatus.PUBLISHED)}
              {kv("OPEN_FOR_ROUTING", data.jobs.byStatus.OPEN_FOR_ROUTING)}
              {kv("ROUTING_IN_PROGRESS", data.jobs.byStatus.ROUTING_IN_PROGRESS)}
              {kv("ASSIGNED", data.jobs.byStatus.ASSIGNED)}
              {kv("IN_PROGRESS", data.jobs.byStatus.IN_PROGRESS)}
              {kv("COMPLETED", data.jobs.byStatus.COMPLETED)}
              {kv("Mock", data.jobs.mock)}
              {kv("Real", data.jobs.real)}
            </Card>

            <Card title="Job Posters" tone={sectionTone(data.jobPosters.total, data.jobs.total > 0 && data.jobPosters.total === 0)}>
              {kv("Total", data.jobPosters.total)}
              {kv("From users.byRole.JOB_POSTER", data.users.byRole.JOB_POSTER)}
            </Card>

            <Card title="Contractors" tone={sectionTone(data.contractors.total, data.contractors.total > 0 && data.contractors.stripeConnected === 0)}>
              {kv("Total", data.contractors.total)}
              {kv("Approved", data.contractors.approved)}
              {kv("Pending", data.contractors.pending)}
              {kv("Rejected", data.contractors.rejected)}
              {kv("Stripe Connected", data.contractors.stripeConnected)}
              {kv("Stripe Verified", data.contractors.stripeVerified)}
            </Card>

            <Card title="Routers" tone={sectionTone(data.routers.total, data.jobs.byStatus.OPEN_FOR_ROUTING > 0 && data.routers.total === 0)}>
              {kv("Total", data.routers.total)}
              {kv("Stripe Connected", data.routers.stripeConnected)}
              {kv("Stripe Verified", data.routers.stripeVerified)}
            </Card>

            <Card title="Invites" tone={sectionTone(data.invites.total)}>
              {kv("Total", data.invites.total)}
              {kv("Pending", data.invites.pending)}
              {kv("Accepted", data.invites.accepted)}
              {kv("Declined", data.invites.declined)}
              {kv("Auto Declined", data.invites.autoDeclined)}
            </Card>
          </div>

          <details style={{ marginTop: 12, border: "1px solid rgba(148,163,184,0.16)", borderRadius: 12, padding: 12, background: "rgba(2,6,23,0.28)" }}>
            <summary style={{ cursor: "pointer", fontWeight: 900 }}>DB Identity Debug</summary>
            <div style={{ marginTop: 10 }}>
              {kv("Database", data.dbIdentity.database ?? "—")}
              {kv("Schema", data.dbIdentity.schema ?? "—")}
              {kv("Host", data.dbIdentity.hostMasked ?? "—")}
              {kv("Environment", data.dbIdentity.environment)}
            </div>
          </details>
        </>
      ) : null}
    </div>
  );
}
