import { adminApiFetch } from "@/server/adminApi";
import { redirect } from "next/navigation";

type Item = {
  id: string;
  createdAt: string;
  archived: boolean;
  tradeCategory: string;
  title: string;
  scope: string;
  scopeQualityScore: number;
  scopeQualityFlags: string[];
  suggestedScope: string;
  wouldChange: boolean;
  rewriteReasons: string[];
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
const inputStyle: React.CSSProperties = { ...selectStyle, minWidth: 260 };
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
const linkStyle: React.CSSProperties = { color: "rgba(56,189,248,0.95)", textDecoration: "none", fontWeight: 900 };

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

export default async function DescriptionAuditPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const get = (k: string) => String(Array.isArray((sp as any)[k]) ? (sp as any)[k][0] : (sp as any)[k] ?? "").trim();

  const q = get("q");
  const take = get("take") || "200";
  const onlyFlagged = get("onlyFlagged") || "true";
  const includeArchived = get("includeArchived") || "false";
  const banner = get("banner");

  async function rewriteSelected(formData: FormData) {
    "use server";
    const ids = formData.getAll("jobId").map((x) => String(x)).filter(Boolean);
    const mode = String(formData.get("mode") ?? "selected");
    const includeArchived2 = String(formData.get("includeArchived") ?? "false") === "true";
    const onlyFlagged2 = String(formData.get("onlyFlagged") ?? "true") === "true";

    const payload =
      mode === "flagged"
        ? { onlyFlagged: true, includeArchived: includeArchived2 }
        : { jobIds: ids, onlyFlagged: onlyFlagged2, includeArchived: includeArchived2 };

    try {
      const res = await adminApiFetch<{ updated: number }>(`/api/admin/jobs/scope-audit/rewrite`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      redirect(
        `/jobs/description-audit${qs({
          q: q || undefined,
          take,
          onlyFlagged,
          includeArchived,
          banner: `rewritten:${String((res as any).updated ?? 0)}`,
        })}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "rewrite_failed";
      redirect(
        `/jobs/description-audit${qs({
          q: q || undefined,
          take,
          onlyFlagged,
          includeArchived,
          banner: `rewrite_failed:${msg}`,
        })}`,
      );
    }
  }

  let items: Item[] = [];
  let err: string | null = null;
  try {
    const data = await adminApiFetch<{ items: Item[] }>(
      `/api/admin/jobs/scope-audit${qs({
        q: q || undefined,
        take,
        onlyFlagged,
        includeArchived,
      })}`,
    );
    items = data.items ?? [];
  } catch (e) {
    err = e instanceof Error ? e.message : "Failed to load";
  }

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950, letterSpacing: 0.2 }}>Description Quality Audit</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)", maxWidth: 980 }}>
        Deterministic rewrite pass for `scope` (job description): shorter, less robotic, removes “We are seeking…” / “This job requires…”.
      </p>

      {banner ? (
        <div style={{ marginTop: 10, fontWeight: 900, color: banner.includes("failed") ? "rgba(254,202,202,0.95)" : "rgba(134,239,172,0.95)" }}>
          {banner}
        </div>
      ) : null}
      {err ? <div style={{ marginTop: 10, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{err}</div> : null}

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 12, alignItems: "start" }}>
        <Card title="Filters" subtitle="Search is server-side over job id/title/scope.">
          <form method="GET" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input name="q" defaultValue={q} placeholder="Search job id/title/scope" style={{ ...inputStyle, minWidth: 320 }} />
            <input name="take" defaultValue={take} placeholder="take" style={{ ...inputStyle, minWidth: 120 }} />
            <select name="onlyFlagged" defaultValue={onlyFlagged} style={selectStyle}>
              <option value="true">Only flagged</option>
              <option value="false">All</option>
            </select>
            <select name="includeArchived" defaultValue={includeArchived} style={selectStyle}>
              <option value="false">Hide archived</option>
              <option value="true">Include archived</option>
            </select>
            <button type="submit" style={buttonStyle}>
              Apply
            </button>
          </form>
        </Card>

        <Card title="Batch rewrite" subtitle="Writes are audited as JOB_SCOPE_REWRITE_ADMIN.">
          <form action={rewriteSelected} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input type="hidden" name="mode" value="flagged" />
            <input type="hidden" name="includeArchived" value={includeArchived} />
            <input type="hidden" name="onlyFlagged" value={onlyFlagged} />
            <button type="submit" style={dangerButtonStyle}>
              Rewrite all flagged (current filter)
            </button>
          </form>
        </Card>
      </div>

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <form action={rewriteSelected}>
          <input type="hidden" name="mode" value="selected" />
          <input type="hidden" name="includeArchived" value={includeArchived} />
          <input type="hidden" name="onlyFlagged" value={onlyFlagged} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ color: "rgba(226,232,240,0.70)", fontSize: 13 }}>
              Showing <b>{items.length}</b> jobs.
            </div>
            <button type="submit" style={dangerButtonStyle}>
              Rewrite selected
            </button>
          </div>

          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                {["", "Score", "Flags", "Current description", "Suggested description", "Job"].map((h) => (
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
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 12, color: "rgba(226,232,240,0.65)" }}>
                    No results.
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id}>
                    <td style={tdStyle}>
                      <input type="checkbox" name="jobId" value={it.id} defaultChecked={it.wouldChange} />
                    </td>
                    <td style={tdStyle}>
                      {pill(String(it.scopeQualityScore), it.scopeQualityScore >= 85 ? "green" : it.scopeQualityScore >= 65 ? "amber" : "red")}
                    </td>
                    <td style={tdStyle}>
                      {it.scopeQualityFlags.length ? (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {it.scopeQualityFlags.slice(0, 6).map((f) => pill(f, "slate"))}
                        </div>
                      ) : (
                        <span style={{ color: "rgba(226,232,240,0.60)" }}>—</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 900 }}>{it.title}</div>
                      <div style={{ marginTop: 6, color: "rgba(226,232,240,0.70)", fontSize: 12, whiteSpace: "pre-wrap" }}>
                        {it.scope ? it.scope.slice(0, 400) : "—"}
                        {it.scope && it.scope.length > 400 ? "…" : ""}
                      </div>
                      <div style={{ marginTop: 6, color: "rgba(226,232,240,0.55)", fontSize: 12 }}>
                        {it.tradeCategory} · {it.createdAt.slice(0, 10)}
                        {it.archived ? " · archived" : ""}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 900 }}>{it.wouldChange ? pill("would change", "amber") : pill("no change", "green")}</div>
                      <div style={{ marginTop: 6, color: "rgba(226,232,240,0.70)", fontSize: 12, whiteSpace: "pre-wrap" }}>
                        {it.suggestedScope ? it.suggestedScope.slice(0, 400) : "—"}
                        {it.suggestedScope && it.suggestedScope.length > 400 ? "…" : ""}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <a href={`/jobs/${encodeURIComponent(it.id)}`} style={linkStyle}>
                        Open
                      </a>
                      <div style={{ marginTop: 6, color: "rgba(226,232,240,0.55)", fontSize: 12 }}>
                        <code>{it.id}</code>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </form>
      </div>
    </div>
  );
}

