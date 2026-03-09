"use client";

const card: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: 16, padding: 20, background: "var(--card-bg)", marginBottom: 16 };

function PlatformCard({ name, description, note }: { name: string; description: string; note: string }) {
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>{name}</div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "rgba(148,163,184,0.12)", color: "var(--muted)" }}>External</span>
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13, margin: 0, marginBottom: 12 }}>{description}</p>
      <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(2,6,23,0.4)", fontSize: 12, color: "rgba(148,163,184,0.7)" }}>
        {note}
      </div>
    </div>
  );
}

export default function AdvertisingPage() {
  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Advertising</h1>
      <p style={{ marginTop: 8, color: "var(--muted)", maxWidth: 720 }}>
        Monitor ad performance across networks. Campaigns are managed externally — this dashboard displays reporting summaries only.
      </p>

      <div style={{ marginTop: 20, padding: 16, borderRadius: 14, background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)", marginBottom: 24 }}>
        <div style={{ fontWeight: 900, color: "rgba(251,191,36,0.9)", marginBottom: 6 }}>Advertising API Integration Required</div>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
          To display live metrics, connect your ad platforms via their respective API credentials. Configure these keys securely in your environment and enable reporting below.
        </p>
      </div>

      <PlatformCard
        name="Meta Ads"
        description="Facebook & Instagram ad performance. Shows spend, clicks, conversions, cost per signup and cost per job post."
        note="Requires Meta Ads API access token and Ad Account ID. Connect via Meta Business Manager → Apps → Marketing API."
      />
      <PlatformCard
        name="Google Ads"
        description="Google Search and Display campaign metrics. Shows impressions, clicks, conversions, and ROAS."
        note="Requires Google Ads API developer token and OAuth2 credentials. Connect via Google Ads API Center."
      />
      <PlatformCard
        name="Reddit Ads"
        description="Reddit campaign performance for contractor and homeowner targeting."
        note="Requires Reddit Ads API credentials. Connect via Reddit Business → Developer Settings."
      />

      <div style={card}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>Summary Metrics (Live Integration Pending)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          {[
            { label: "Total Ad Spend", value: "—" },
            { label: "Total Clicks", value: "—" },
            { label: "Conversions", value: "—" },
            { label: "Cost / Signup", value: "—" },
            { label: "Cost / Job Post", value: "—" },
          ].map((m) => (
            <div key={m.label} style={{ textAlign: "center", padding: "14px 10px", borderRadius: 12, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 24, fontWeight: 950, color: "rgba(148,163,184,0.4)" }}>{m.value}</div>
              <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
