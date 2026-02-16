"use client";

import { useMemo, useState } from "react";
import { diseFetch } from "@/lib/api";

type Scope = "REGIONAL" | "NATIONAL";

type UploadResponse = {
  ok: true;
  inserted: number;
  skippedDuplicates: number;
  rejected: number;
  errors: Array<{ row: number; reason: string }>;
};

const EXPECTED_HEADER =
  "name,homepageUrl,submissionUrl,contactEmail,region,country,scope,category,free,requiresApproval,authorityScore";

const CA_PROVINCES = [
  "AB",
  "BC",
  "MB",
  "NB",
  "NL",
  "NS",
  "NT",
  "NU",
  "ON",
  "PE",
  "QC",
  "SK",
  "YT",
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

function parseCsv(text: string): { header: string; rows: string[][] } {
  const lines = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);
  const header = lines[0] ?? "";
  const rows = lines.slice(1).map(parseCsvLine);
  return { header, rows };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function normalizeUrl(raw: string): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol === "http:") u.protocol = "https:";
  u.search = "";
  u.hash = "";
  if (u.pathname.endsWith("/") && u.pathname !== "/") u.pathname = u.pathname.replace(/\/+$/, "");
  u.hostname = u.hostname.toLowerCase();
  return u.toString().replace(/\/$/, "");
}

function parseBool(raw: string): boolean | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

function parseScore(raw: string): number | null {
  const v = String(raw ?? "").trim();
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null;
}

const THREE_PART_SUFFIXES = new Set([
  "co.uk","org.uk","ac.uk","gov.uk","com.au","net.au","org.au","co.nz","co.in","com.in",
]);

function rootDomainFromHost(host: string): string {
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  const last2 = parts.slice(-2).join(".");
  if (THREE_PART_SUFFIXES.has(last2)) return parts.slice(-3).join(".");
  return last2;
}

function rootDomainFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/\.$/, "");
    const h = host.startsWith("www.") ? host.slice(4) : host;
    return rootDomainFromHost(h);
  } catch {
    return null;
  }
}

function normalizeScope(raw: string): Scope | null {
  const v = String(raw ?? "").trim().toUpperCase();
  return v === "REGIONAL" || v === "NATIONAL" ? (v as Scope) : null;
}

function normalizeCountry(raw: string): "CA" | "US" | null {
  const v = String(raw ?? "").trim().toUpperCase();
  if (!v) return null;
  if (v === "CA" || v === "CANADA") return "CA";
  if (v === "US" || v === "USA") return "US";
  return null;
}

function inferCountryFromRegion(region: string): "CA" | "US" | null {
  const r = String(region ?? "").trim().toUpperCase();
  if (CA_PROVINCES.includes(r)) return "CA";
  if (US_STATES.includes(r)) return "US";
  return null;
}

type Preview = {
  headerOk: boolean;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateDomainsWithinCsv: number;
  scopeBreakdown: Record<string, number>;
  countryBreakdown: Record<string, number>;
  sampleErrors: Array<{ row: number; reason: string }>;
};

export default function UploadPage() {
  const [csvText, setCsvText] = useState<string>("");
  const [filename, setFilename] = useState<string>("");

  const [scopeSource, setScopeSource] = useState<"CSV" | "OVERRIDE">("CSV");
  const [overrideScope, setOverrideScope] = useState<Scope>("REGIONAL");
  const [overrideRegion, setOverrideRegion] = useState<string>("BC");
  const [overrideCountry, setOverrideCountry] = useState<"CA" | "US">("CA");

  const [importing, setImporting] = useState(false);
  const [resp, setResp] = useState<UploadResponse | null>(null);
  const [err, setErr] = useState<string>("");

  const preview: Preview | null = useMemo(() => {
    if (!csvText) return null;
    const { header, rows } = parseCsv(csvText);
    const headerOk = header.trim() === EXPECTED_HEADER;
    if (!headerOk) {
      return {
        headerOk: false,
        totalRows: rows.length,
        validRows: 0,
        invalidRows: rows.length,
        duplicateDomainsWithinCsv: 0,
        scopeBreakdown: {},
        countryBreakdown: {},
        sampleErrors: [{ row: 1, reason: "invalid_header_exact_match_required" }],
      };
    }

    const seenDomains = new Set<string>();
    let dupDomains = 0;
    let valid = 0;
    let invalid = 0;
    const scopeBreakdown: Record<string, number> = {};
    const countryBreakdown: Record<string, number> = {};
    const sampleErrors: Array<{ row: number; reason: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      const cols = rows[i] ?? [];
      if (cols.length !== 11) {
        invalid++;
        if (sampleErrors.length < 20) sampleErrors.push({ row: rowNum, reason: "wrong_column_count" });
        continue;
      }

      const [
        nameRaw,
        homepageUrlRaw,
        submissionUrlRaw,
        _contactEmailRaw,
        regionRaw,
        countryRaw,
        scopeRaw,
        categoryRaw,
        freeRaw,
        requiresApprovalRaw,
        authorityScoreRaw,
      ] = cols;

      const homepageUrl = normalizeUrl(homepageUrlRaw);
      const submissionUrl = normalizeUrl(submissionUrlRaw);
      const free = parseBool(freeRaw);
      const requiresApproval = parseBool(requiresApprovalRaw);
      const authorityScore = parseScore(authorityScoreRaw);
      const category = String(categoryRaw ?? "").trim().toUpperCase();

      const scope = scopeSource === "OVERRIDE" ? overrideScope : normalizeScope(scopeRaw);
      const region = scopeSource === "OVERRIDE" ? (overrideScope === "REGIONAL" ? overrideRegion : "") : String(regionRaw ?? "").trim();
      const country =
        scopeSource === "OVERRIDE"
          ? overrideScope === "NATIONAL"
            ? overrideCountry
            : inferCountryFromRegion(region)
          : normalizeCountry(countryRaw);

      const name = String(nameRaw ?? "").trim();
      const domain = homepageUrl ? rootDomainFromUrl(homepageUrl) : null;

      const ok =
        !!name &&
        !!homepageUrl &&
        !!submissionUrl &&
        !!category &&
        free != null &&
        requiresApproval != null &&
        authorityScore != null &&
        !!scope &&
        !!country &&
        (scope === "REGIONAL" ? !!region : !region);

      if (!ok) {
        invalid++;
        if (sampleErrors.length < 20) sampleErrors.push({ row: rowNum, reason: "failed_validation" });
        continue;
      }

      if (domain) {
        if (seenDomains.has(domain)) dupDomains++;
        else seenDomains.add(domain);
      }

      valid++;
      scopeBreakdown[scope] = (scopeBreakdown[scope] ?? 0) + 1;
      countryBreakdown[country] = (countryBreakdown[country] ?? 0) + 1;
    }

    return {
      headerOk: true,
      totalRows: rows.length,
      validRows: valid,
      invalidRows: invalid,
      duplicateDomainsWithinCsv: dupDomains,
      scopeBreakdown,
      countryBreakdown,
      sampleErrors,
    };
  }, [csvText, scopeSource, overrideScope, overrideRegion, overrideCountry]);

  async function onPickFile(file: File | null) {
    setErr("");
    setResp(null);
    if (!file) {
      setCsvText("");
      setFilename("");
      return;
    }
    setFilename(file.name);
    const text = await file.text();
    setCsvText(text);
  }

  async function runImport() {
    if (!csvText) return;
    setImporting(true);
    setErr("");
    setResp(null);
    const payload =
      scopeSource === "OVERRIDE"
        ? {
            csvText,
            scopeSource,
            override: {
              scope: overrideScope,
              region: overrideScope === "REGIONAL" ? overrideRegion : undefined,
              country: overrideScope === "NATIONAL" ? overrideCountry : undefined,
            },
          }
        : { csvText, scopeSource };

    const r = await diseFetch<UploadResponse>("/api/dise/upload", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      setErr(r.error ?? "Upload failed");
    } else {
      setResp(r.data as any);
    }
    setImporting(false);
  }

  return (
    <div>
      <h1 style={{ marginBottom: "0.5rem" }}>Upload</h1>
      <p style={{ color: "#94a3b8", marginBottom: "1rem" }}>
        Import a fully structured CSV into <code>directory_engine.directories</code> (no overwrites).
      </p>

      <div style={{ padding: "1rem", background: "#1e293b", borderRadius: 8, marginBottom: "1rem" }}>
        <div style={{ marginBottom: "0.75rem", fontWeight: 700 }}>CSV File</div>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
        />
        {filename ? <div style={{ marginTop: 8, color: "#94a3b8" }}>{filename}</div> : null}
        <div style={{ marginTop: 10, fontSize: 12, color: "#94a3b8" }}>
          Expected header (exact match): <code>{EXPECTED_HEADER}</code>
        </div>
      </div>

      <div style={{ padding: "1rem", background: "#1e293b", borderRadius: 8, marginBottom: "1rem" }}>
        <div style={{ marginBottom: "0.75rem", fontWeight: 700 }}>Scope Override Mode</div>
        <label style={{ display: "block", marginBottom: 6 }}>
          <input
            type="radio"
            name="scopeSource"
            checked={scopeSource === "CSV"}
            onChange={() => setScopeSource("CSV")}
          />{" "}
          Use CSV values
        </label>
        <label style={{ display: "block", marginBottom: 6 }}>
          <input
            type="radio"
            name="scopeSource"
            checked={scopeSource === "OVERRIDE"}
            onChange={() => setScopeSource("OVERRIDE")}
          />{" "}
          Override via UI selection
        </label>

        {scopeSource === "OVERRIDE" ? (
          <div style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <span>
              <label style={{ marginRight: 6 }}>Scope</label>
              <select value={overrideScope} onChange={(e) => setOverrideScope(e.target.value as Scope)}>
                <option value="REGIONAL">REGIONAL</option>
                <option value="NATIONAL">NATIONAL</option>
              </select>
            </span>

            {overrideScope === "REGIONAL" ? (
              <span>
                <label style={{ marginRight: 6 }}>Province/State</label>
                <select value={overrideRegion} onChange={(e) => setOverrideRegion(e.target.value)}>
                  <optgroup label="Canada">
                    {CA_PROVINCES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="USA">
                    {US_STATES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </span>
            ) : (
              <span>
                <label style={{ marginRight: 6 }}>Country</label>
                <select value={overrideCountry} onChange={(e) => setOverrideCountry(e.target.value as any)}>
                  <option value="CA">Canada (CA)</option>
                  <option value="US">USA (US)</option>
                </select>
              </span>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 10, fontSize: 12, color: "#94a3b8" }}>
            CSV mode enforces per-row scope, country, and region rules strictly.
          </div>
        )}
      </div>

      <div style={{ padding: "1rem", background: "#1e293b", borderRadius: 8, marginBottom: "1rem" }}>
        <div style={{ marginBottom: "0.75rem", fontWeight: 700 }}>Preview</div>
        {!preview ? (
          <div style={{ color: "#94a3b8" }}>Choose a CSV file to preview.</div>
        ) : (
          <>
            {!preview.headerOk ? (
              <div style={{ color: "#f87171" }}>Invalid header. Exact match required.</div>
            ) : null}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              <Stat label="Parsed rows" value={preview.totalRows} />
              <Stat label="Valid rows" value={preview.validRows} />
              <Stat label="Invalid rows" value={preview.invalidRows} />
              <Stat label="Duplicate domains (CSV)" value={preview.duplicateDomainsWithinCsv} />
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 24, flexWrap: "wrap" }}>
              <Breakdown title="Scope breakdown" data={preview.scopeBreakdown} />
              <Breakdown title="Country breakdown" data={preview.countryBreakdown} />
            </div>

            {preview.sampleErrors.length ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Sample validation issues (first 20)</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: "#fbbf24" }}>
                  {preview.sampleErrors.map((e, idx) => (
                    <li key={idx}>
                      row {e.row}: {e.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>

      {err ? <div style={{ color: "#f87171", marginBottom: 12 }}>{err}</div> : null}

      <button
        onClick={() => void runImport()}
        disabled={!csvText || importing || (preview ? !preview.headerOk : true)}
        style={{
          padding: "0.6rem 1rem",
          background: "#3b82f6",
          border: "none",
          borderRadius: 8,
          cursor: importing ? "not-allowed" : "pointer",
          opacity: !csvText || importing ? 0.6 : 1,
        }}
      >
        {importing ? "Importing…" : "Import CSV"}
      </button>

      {resp ? (
        <div style={{ marginTop: 16, padding: "1rem", background: "#0b1220", border: "1px solid #334155", borderRadius: 8 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Import result</div>
          <div>Inserted: {resp.inserted}</div>
          <div>Skipped duplicates: {resp.skippedDuplicates}</div>
          <div>Rejected: {resp.rejected}</div>
          {resp.errors?.length ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Errors</div>
              <pre style={{ margin: 0, fontSize: 12, color: "#e2e8f0", whiteSpace: "pre-wrap" }}>
                {JSON.stringify(resp.errors.slice(0, 50), null, 2)}
              </pre>
              {resp.errors.length > 50 ? (
                <div style={{ marginTop: 6, color: "#94a3b8", fontSize: 12 }}>
                  Showing first 50 of {resp.errors.length}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ padding: "0.75rem", border: "1px solid #334155", borderRadius: 8, background: "#0f172a" }}>
      <div style={{ fontSize: 12, color: "#94a3b8" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function Breakdown({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data);
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
      {entries.length ? (
        <ul style={{ margin: 0, paddingLeft: 18, color: "#e2e8f0" }}>
          {entries.map(([k, v]) => (
            <li key={k}>
              {k}: {v}
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ color: "#94a3b8" }}>—</div>
      )}
    </div>
  );
}

