import { adminApiFetch } from "@/server/adminApi";
import { redirect } from "next/navigation";

type TradeRow = {
  tradeCategory: string;
  totalJobs: number;
  withImage: number;
  missingImage: number;
  coveragePct: number;
};

type AuditResp = {
  scope: { mockOnly: boolean; includeArchived: boolean };
  overall: { totalJobs: number; withImage: number; missingImage: number; coveragePct: number; targetPct: number };
  byTrade: TradeRow[];
};

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

const selectStyle: React.CSSProperties = {
  background: "rgba(2,6,23,0.35)",
  border: "1px solid rgba(148,163,184,0.14)",
  color: "rgba(226,232,240,0.92)",
  borderRadius: 12,
  padding: "9px 10px",
  fontSize: 13,
  minWidth: 180,
};
const buttonStyle: React.CSSProperties = {
  background: "rgba(34,197,94,0.16)",
  border: "1px solid rgba(34,197,94,0.35)",
  color: "rgba(134,239,172,0.95)",
  borderRadius: 12,
  padding: "9px 12px",
  fontSize: 13,
  fontWeight: 950,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const dangerButtonStyle: React.CSSProperties = {
  background: "rgba(248,113,113,0.12)",
  border: "1px solid rgba(248,113,113,0.35)",
  color: "rgba(254,202,202,0.95)",
  borderRadius: 12,
  padding: "9px 12px",
  fontSize: 13,
  fontWeight: 950,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(148,163,184,0.10)",
  verticalAlign: "top",
  color: "rgba(226,232,240,0.86)",
  fontSize: 13,
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

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid rgba(148,163,184,0.14)",
        borderRadius: 16,
        padding: 12,
        background: "rgba(2,6,23,0.30)",
      }}
    >
      <div style={{ fontWeight: 950, letterSpacing: 0.2 }}>{title}</div>
      {subtitle ? <div style={{ marginTop: 4, color: "rgba(226,232,240,0.65)", fontSize: 12 }}>{subtitle}</div> : null}
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

export default async function ImageAuditPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const get = (k: string) => String(Array.isArray((sp as any)[k]) ? (sp as any)[k][0] : (sp as any)[k] ?? "").trim();

  const mockOnly = get("mockOnly") || "true";
  const includeArchived = get("includeArchived") || "false";
  const banner = get("banner");

  async function assignImages(formData: FormData) {
    "use server";
    const mockOnly2 = String(formData.get("mockOnly") ?? "true") === "true";
    const includeArchived2 = String(formData.get("includeArchived") ?? "false") === "true";
    const dryRun = String(formData.get("dryRun") ?? "false") === "true";

    try {
      const res = await adminApiFetch<{ inserted: number; attempted: number }>(`/api/admin/jobs/image-audit/assign`, {
        method: "POST",
        body: JSON.stringify({ mockOnly: mockOnly2, includeArchived: includeArchived2, dryRun, take: 2000 }),
      });
      redirect(
        `/jobs/image-audit${qs({
          mockOnly: mockOnly2 ? "true" : "false",
          includeArchived: includeArchived2 ? "true" : "false",
          banner: dryRun ? `dry_run_attempted:${String((res as any).attempted ?? 0)}` : `inserted:${String((res as any).inserted ?? 0)}`,
        })}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "assign_failed";
      redirect(
        `/jobs/image-audit${qs({
          mockOnly: mockOnly,
          includeArchived,
          banner: `assign_failed:${msg}`,
        })}`,
      );
    }
  }

  let data: AuditResp | null = null;
  let err: string | null = null;
  try {
    data = await adminApiFetch<AuditResp>(`/api/admin/jobs/image-audit${qs({ mockOnly, includeArchived })}`);
  } catch (e) {
    err = e instanceof Error ? e.message : "Failed to load";
  }

  const overall = data?.overall ?? { totalJobs: 0, withImage: 0, missingImage: 0, coveragePct: 0, targetPct: 80 };
  const ok80 = overall.coveragePct >= 80;

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950, letterSpacing: 0.2 }}>Job Image Coverage Audit (80% rule)</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)", maxWidth: 980 }}>
        Counts jobs by trade, counts jobs with at least one image URL, and bulk-assigns deterministic trade stock images for missing jobs.
      </p>

      {banner ? (
        <div style={{ marginTop: 10, fontWeight: 900, color: banner.includes("failed") ? "rgba(254,202,202,0.95)" : "rgba(134,239,172,0.95)" }}>
          {banner}
        </div>
      ) : null}
      {err ? <div style={{ marginTop: 10, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{err}</div> : null}

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 12, alignItems: "start" }}>
        <Card title="Scope" subtitle="Default focuses on mock jobs (existing).">
          <form method="GET" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select name="mockOnly" defaultValue={mockOnly} style={selectStyle}>
              <option value="true">Mock jobs only</option>
              <option value="false">Real jobs only</option>
            </select>
            <select name="includeArchived" defaultValue={includeArchived} style={selectStyle}>
              <option value="false">Hide archived</option>
              <option value="true">Include archived</option>
            </select>
            <button type="submit" style={buttonStyle}>
              Refresh
            </button>
          </form>

          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {pill(`coverage ${overall.coveragePct}%`, ok80 ? "green" : "amber")}
            {pill(`with image ${overall.withImage}/${overall.totalJobs}`, "slate")}
            {pill(`missing ${overall.missingImage}`, overall.missingImage > 0 ? "amber" : "green")}
          </div>
        </Card>

        <Card
          title="Bulk assign images"
          subtitle="Deterministic rotation via @8fold/shared MOCK_JOB_IMAGES. Writes JobPhoto(kind=TRADE_STOCK)."
        >
          <form action={assignImages} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input type="hidden" name="mockOnly" value={mockOnly} />
            <input type="hidden" name="includeArchived" value={includeArchived} />

            <button type="submit" style={dangerButtonStyle}>
              Assign trade images (apply)
            </button>

            <button type="submit" name="dryRun" value="true" style={buttonStyle}>
              Dry run (no writes)
            </button>

            <div style={{ fontSize: 12, color: "rgba(226,232,240,0.62)", lineHeight: 1.45 }}>
              Rotation is even per trade (no repeats until the trade’s image pool is exhausted).
            </div>
          </form>
        </Card>
      </div>

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              {["Trade", "Total", "With image", "Coverage", "Missing"].map((h) => (
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
            {(data?.byTrade ?? []).map((r) => {
              const ok = r.coveragePct >= 80;
              return (
                <tr key={r.tradeCategory}>
                  <td style={tdStyle}>
                    <b>{r.tradeCategory}</b>
                  </td>
                  <td style={tdStyle}>{r.totalJobs}</td>
                  <td style={tdStyle}>{r.withImage}</td>
                  <td style={tdStyle}>{pill(`${r.coveragePct}%`, ok ? "green" : "amber")}</td>
                  <td style={tdStyle}>{r.missingImage}</td>
                </tr>
              );
            })}
            {!data?.byTrade?.length ? (
              <tr>
                <td colSpan={5} style={{ padding: 12, color: "rgba(226,232,240,0.65)" }}>
                  No data.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

