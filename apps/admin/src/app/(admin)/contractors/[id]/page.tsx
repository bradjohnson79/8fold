import { adminApiFetch } from "@/server/adminApiV4";

type JobRef = { id: string; title: string; statusRaw: string; displayStatus: string; createdAt: string; updatedAt: string; amountCents: number };
type DetailResp = {
  profile: {
    id: string;
    role: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    country: string | null;
    regionCode: string | null;
    city: string | null;
    serviceRegion: string | null;
    verification: { termsAccepted: boolean | null; profileComplete: boolean | null; approved: boolean | null };
    paymentSetup: { hasPayoutMethod: boolean; stripeConnected: boolean; payoutStatus: string | null };
    metadata: Record<string, unknown>;
  };
  accountStatus: {
    status: string;
    suspendedUntil: string | null;
    suspensionReason: string | null;
    archivedAt: string | null;
    archivedReason: string | null;
    disabled: boolean;
    lastLoginAt: string | null;
  };
  recentJobs: JobRef[];
  payoutReadiness: { hasPayoutMethod: boolean; stripeConnected: boolean; eligible: boolean; blockers: string[] };
  enforcement: { strikes?: number; flags?: number; suspendedUntil?: string | null; archivedAt?: string | null };
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid rgba(148,163,184,0.14)", borderRadius: 16, padding: 14, background: "rgba(2,6,23,0.35)" }}>
      <div style={{ fontWeight: 950, color: "rgba(226,232,240,0.95)" }}>{title}</div>
      <div style={{ marginTop: 10, color: "rgba(226,232,240,0.90)" }}>{children}</div>
    </div>
  );
}

function kv(label: string, value: React.ReactNode) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "170px 1fr", gap: 10, padding: "6px 0" }}>
      <div style={{ color: "rgba(226,232,240,0.65)", fontSize: 12, fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(226,232,240,0.92)" }}>{value}</div>
    </div>
  );
}

function fmt(v: string | null | undefined) {
  return v ? v.slice(0, 19).replace("T", " ") : "—";
}

function money(cents: number) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

export default async function ContractorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let data: DetailResp | null = null;
  let err: string | null = null;
  try {
    data = await adminApiFetch<DetailResp>(`/api/admin/v4/contractors/${encodeURIComponent(id)}`);
  } catch (e) {
    err = e instanceof Error ? e.message : "Failed to load contractor";
  }

  if (!data || err) {
    return (
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Contractor</h1>
        <p style={{ marginTop: 10, color: "rgba(254,202,202,0.95)" }}>{err ?? "Failed to load"}</p>
        <a href="/contractors" style={{ color: "rgba(191,219,254,0.95)", textDecoration: "none", fontWeight: 900 }}>
          ← Back to Contractors
        </a>
      </div>
    );
  }

  const p = data.profile;
  const a = data.accountStatus;

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Contractor Detail</h1>
      <div style={{ marginTop: 6 }}>
        <a href="/contractors" style={{ color: "rgba(191,219,254,0.95)", textDecoration: "none", fontWeight: 900 }}>
          ← Back
        </a>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        <Card title="Profile">
          {kv("Name", p.name ?? "—")}
          {kv("Email", p.email ?? "—")}
          {kv("Phone", p.phone ?? "—")}
          {kv("Country", p.country ?? "—")}
          {kv("Region", p.regionCode ?? "—")}
          {kv("City", p.city ?? "—")}
          {kv("Service region", p.serviceRegion ?? "—")}
        </Card>

        <Card title="Account Status">
          {kv("Status", a.status)}
          {kv("Suspended until", fmt(a.suspendedUntil))}
          {kv("Suspension reason", a.suspensionReason ?? "—")}
          {kv("Archived at", fmt(a.archivedAt))}
          {kv("Archived reason", a.archivedReason ?? "—")}
          {kv("Last login", fmt(a.lastLoginAt))}
        </Card>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <Card title="Verification / Setup">
          {kv("Terms accepted", String(p.verification.termsAccepted))}
          {kv("Profile complete", String(p.verification.profileComplete))}
          {kv("Approved", String(p.verification.approved))}
          {kv("Payout method", p.paymentSetup.hasPayoutMethod ? "Configured" : "Missing")}
          {kv("Stripe connected", p.paymentSetup.stripeConnected ? "Yes" : "No")}
          {kv("Payout status", p.paymentSetup.payoutStatus ?? "—")}
        </Card>

        <Card title="Payout Readiness">
          {kv("Eligible", data.payoutReadiness.eligible ? "Yes" : "No")}
          {kv("Has payout method", data.payoutReadiness.hasPayoutMethod ? "Yes" : "No")}
          {kv("Stripe connected", data.payoutReadiness.stripeConnected ? "Yes" : "No")}
          {kv("Blockers", data.payoutReadiness.blockers.length ? data.payoutReadiness.blockers.join(", ") : "None")}
        </Card>

        <Card title="Enforcement">
          {kv("Strikes", String(data.enforcement.strikes ?? 0))}
          {kv("Flags", String(data.enforcement.flags ?? 0))}
          {kv("Suspended until", fmt(data.enforcement.suspendedUntil))}
          {kv("Archived at", fmt(data.enforcement.archivedAt))}
          <div style={{ marginTop: 8, color: "rgba(226,232,240,0.68)", fontSize: 12 }}>Admin notes: Coming soon</div>
        </Card>
      </div>

      <div style={{ marginTop: 12 }}>
        <Card title="Recent Jobs">
          {data.recentJobs.length === 0 ? (
            <div style={{ color: "rgba(226,232,240,0.68)", fontSize: 13 }}>No jobs yet.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr>
                    {["Job", "Status", "Created", "Updated", "Amount"].map((h) => (
                      <th key={h} style={{ textAlign: "left", fontSize: 12, padding: "8px 8px", color: "rgba(226,232,240,0.70)", borderBottom: "1px solid rgba(148,163,184,0.12)" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.recentJobs.map((j) => (
                    <tr key={j.id}>
                      <td style={cellStyle}>
                        <a href={`/jobs/${encodeURIComponent(j.id)}`} style={{ color: "rgba(191,219,254,0.95)", textDecoration: "none", fontWeight: 900 }}>
                          {j.title}
                        </a>
                      </td>
                      <td style={cellStyle}>{j.displayStatus}</td>
                      <td style={cellStyle}>{fmt(j.createdAt)}</td>
                      <td style={cellStyle}>{fmt(j.updatedAt)}</td>
                      <td style={cellStyle}>{money(j.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

const cellStyle: React.CSSProperties = {
  padding: "8px 8px",
  borderBottom: "1px solid rgba(148,163,184,0.08)",
  color: "rgba(226,232,240,0.9)",
  fontSize: 13,
};
