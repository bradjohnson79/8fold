import { adminApiFetch } from "@/server/adminApi";
import { CopyJsonClient } from "./CopyJsonClient";

type IntegrityRow = {
  severity: "CRITICAL" | "HIGH" | "WARN";
  jobId: string;
  createdAt: string | null;
  releasedAt: string | null;
  code: string;
  message: string;
  suggestedAction: string | null;
  details: any;
};

type IntegrityDetailsPayload = {
  generatedAt: string;
  window: { take: number; orphanDays: number };
  summary: any;
  rows: IntegrityRow[];
  violationsBySeverity: Record<string, any[]>;
  jobs: any[];
};

function pill(text: string, tone?: "green" | "red" | "amber" | "slate") {
  const t = tone ?? "slate";
  const bg =
    t === "green"
      ? "rgba(34,197,94,0.14)"
      : t === "red"
        ? "rgba(248,113,113,0.14)"
        : t === "amber"
          ? "rgba(251,191,36,0.12)"
          : "rgba(2,6,23,0.25)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(148,163,184,0.14)",
        background: bg,
        fontSize: 12,
        fontWeight: 900,
        color: "rgba(226,232,240,0.90)",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

const tdStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(148,163,184,0.10)",
  verticalAlign: "top",
  color: "rgba(226,232,240,0.86)",
  fontSize: 13,
};
const linkStyle: React.CSSProperties = { color: "rgba(56,189,248,0.95)", textDecoration: "none", fontWeight: 900 };

function qs(sp: Record<string, string | undefined>): string {
  const u = new URL("http://internal");
  for (const [k, v] of Object.entries(sp)) {
    if (v == null) continue;
    const s = String(v).trim();
    if (!s) continue;
    u.searchParams.set(k, s);
  }
  const out = u.searchParams.toString();
  return out ? `?${out}` : "";
}

export default async function IntegrityPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const get = (k: string) => String(Array.isArray((sp as any)[k]) ? (sp as any)[k][0] : (sp as any)[k] ?? "").trim();
  const take = get("take") || "500";

  const payload = await adminApiFetch<{ ok: true; data: IntegrityDetailsPayload }>(`/api/admin/finance/payout-integrity/details${qs({ take })}`)
    .then((d: any) => d?.data ?? null)
    .catch(() => null);

  const rows: IntegrityRow[] = payload?.rows ?? [];
  const counts = {
    CRITICAL: rows.filter((r) => r.severity === "CRITICAL").length,
    HIGH: rows.filter((r) => r.severity === "HIGH").length,
    WARN: rows.filter((r) => r.severity === "WARN").length,
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950, letterSpacing: 0.2 }}>Payout Integrity</h1>
          <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)", maxWidth: 980 }}>
            Drilldown of financial integrity violations (DB-authoritative). Sorted deterministically for screenshots and incident threads.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {pill(`CRITICAL: ${counts.CRITICAL}`, counts.CRITICAL > 0 ? "red" : "green")}
          {pill(`HIGH: ${counts.HIGH}`, counts.HIGH > 0 ? "amber" : "green")}
          {pill(`WARN: ${counts.WARN}`, "slate")}
        </div>
      </div>

      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <form method="GET" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            name="take"
            defaultValue={take}
            placeholder="take"
            style={{
              background: "rgba(2,6,23,0.35)",
              border: "1px solid rgba(148,163,184,0.14)",
              color: "rgba(226,232,240,0.92)",
              borderRadius: 12,
              padding: "9px 10px",
              fontSize: 13,
              minWidth: 120,
            }}
          />
          <button
            type="submit"
            style={{
              background: "rgba(34,197,94,0.16)",
              border: "1px solid rgba(34,197,94,0.35)",
              color: "rgba(134,239,172,0.95)",
              borderRadius: 12,
              padding: "9px 12px",
              fontSize: 13,
              fontWeight: 950,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Apply
          </button>
          <a href="/payouts" style={linkStyle}>
            Back to payouts →
          </a>
        </form>

        {payload ? <CopyJsonClient payload={payload} /> : null}
      </div>

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              {["Severity", "Job", "Code", "Message", "Suggested action", "Debug"].map((h) => (
                <th
                  key={h}
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
            {!payload ? (
              <tr>
                <td colSpan={6} style={{ padding: 12, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>
                  Failed to load integrity payload.
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 12, color: "rgba(226,232,240,0.65)" }}>
                  No violations found.
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => {
                const tone = r.severity === "CRITICAL" ? "red" : r.severity === "HIGH" ? "amber" : "slate";
                const jobLink = r.jobId && r.jobId !== "aggregate" ? `/jobs/${encodeURIComponent(r.jobId)}` : null;
                return (
                  <tr key={`${r.severity}:${r.jobId}:${r.code}:${idx}`}>
                    <td style={tdStyle}>{pill(r.severity, tone as any)}</td>
                    <td style={tdStyle}>
                      {jobLink ? (
                        <a href={jobLink} style={linkStyle}>
                          <code>{r.jobId}</code>
                        </a>
                      ) : (
                        <code>{r.jobId || "—"}</code>
                      )}
                      <div style={{ marginTop: 4, color: "rgba(226,232,240,0.55)", fontSize: 12 }}>
                        created {String(r.createdAt ?? "—").slice(0, 10)} • released {String(r.releasedAt ?? "—").slice(0, 10)}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <code>{r.code}</code>
                    </td>
                    <td style={tdStyle}>{r.message}</td>
                    <td style={tdStyle}>{r.suggestedAction ?? "—"}</td>
                    <td style={tdStyle}>
                      <details>
                        <summary style={{ cursor: "pointer", fontWeight: 900, color: "rgba(226,232,240,0.78)" }}>JSON</summary>
                        <pre
                          style={{
                            marginTop: 8,
                            padding: 10,
                            borderRadius: 12,
                            border: "1px solid rgba(148,163,184,0.14)",
                            background: "rgba(2,6,23,0.30)",
                            maxWidth: 720,
                            overflowX: "auto",
                            fontSize: 12,
                            color: "rgba(226,232,240,0.86)",
                          }}
                        >
                          {JSON.stringify(r, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

