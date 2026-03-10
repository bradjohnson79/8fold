"use client";

import { useCallback, useEffect, useState } from "react";

type SeoSettings = {
  siteTitle?: string | null;
  siteDescription?: string | null;
  defaultMetaTitle?: string | null;
  defaultMetaDescription?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
  twitterCardImage?: string | null;
  canonicalDomain?: string | null;
  robotsTxt?: string | null;
  ga4MeasurementId?: string | null;
  metaPixelId?: string | null;
  indexNowKey?: string | null;
};

type PageTemplates = {
  jobs?: { titleTemplate: string; descriptionTemplate: string };
  services?: { titleTemplate: string; descriptionTemplate: string };
  cities?: { titleTemplate: string; descriptionTemplate: string };
  contractors?: { titleTemplate: string; descriptionTemplate: string };
};

const card: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 20,
  background: "var(--card-bg)",
  marginBottom: 16,
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "var(--muted)",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--input-bg)",
  color: "var(--text)",
  fontSize: 14,
  boxSizing: "border-box",
};

const textarea: React.CSSProperties = {
  ...input,
  minHeight: 80,
  resize: "vertical",
  fontFamily: "inherit",
};

const btn: React.CSSProperties = {
  padding: "10px 20px",
  borderRadius: 10,
  border: "none",
  background: "rgba(34,197,94,0.16)",
  color: "rgba(34,197,94,1)",
  fontWeight: 900,
  cursor: "pointer",
  fontSize: 14,
};

export default function SeoEnginePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [settings, setSettings] = useState<SeoSettings>({});
  const [templates, setTemplates] = useState<PageTemplates>({});
  const [activeTab, setActiveTab] = useState<"global" | "templates">("global");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sResp, tResp] = await Promise.all([
        fetch("/api/admin/v4/seo/settings", { cache: "no-store" }),
        fetch("/api/admin/v4/seo/templates", { cache: "no-store" }),
      ]);
      const sJson = await sResp.json().catch(() => null);
      const tJson = await tResp.json().catch(() => null);

      if (sJson?.ok) setSettings(sJson.data?.settings ?? {});
      if (tJson?.ok) setTemplates(tJson.data?.templates ?? {});
    } catch {
      setError("Failed to load SEO settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveSettings = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const resp = await fetch("/api/admin/v4/seo/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        setError(json?.error?.message ?? "Failed to save settings");
      } else {
        setSuccess("SEO settings saved successfully");
      }
    } catch {
      setError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const saveTemplates = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const resp = await fetch("/api/admin/v4/seo/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templates),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        setError(json?.error?.message ?? "Failed to save templates");
      } else {
        setSuccess("SEO templates saved successfully");
      }
    } catch {
      setError("Failed to save templates");
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof SeoSettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setSettings((prev) => ({ ...prev, [key]: e.target.value }));

  const setTpl = (page: keyof PageTemplates, field: "titleTemplate" | "descriptionTemplate") =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setTemplates((prev) => ({
        ...prev,
        [page]: { ...prev[page], [field]: e.target.value },
      }));

  const tabStyle = (tab: "global" | "templates"): React.CSSProperties => ({
    padding: "8px 18px",
    borderRadius: 10,
    border: "none",
    background: activeTab === tab ? "rgba(34,197,94,0.14)" : "transparent",
    color: activeTab === tab ? "rgba(34,197,94,1)" : "var(--muted)",
    fontWeight: 900,
    cursor: "pointer",
    fontSize: 13,
  });

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>SEO Engine</h1>
      <p style={{ marginTop: 8, color: "var(--muted)", maxWidth: 720 }}>
        Control global SEO settings, dynamic page templates, and structured data configuration.
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 16, marginBottom: 20 }}>
        <button style={tabStyle("global")} onClick={() => setActiveTab("global")}>Global Settings</button>
        <button style={tabStyle("templates")} onClick={() => setActiveTab("templates")}>Page Templates</button>
      </div>

      {loading && <div style={{ color: "var(--muted)" }}>Loading SEO settings…</div>}
      {error && <div style={{ color: "rgba(254,202,202,0.95)", marginBottom: 12, fontWeight: 700 }}>{error}</div>}
      {success && <div style={{ color: "rgba(134,239,172,0.95)", marginBottom: 12, fontWeight: 700 }}>{success}</div>}

      {!loading && activeTab === "global" && (
        <div>
          <div style={card}>
            <div style={{ fontWeight: 900, marginBottom: 16 }}>Site Identity</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {(["siteTitle", "siteDescription", "defaultMetaTitle", "defaultMetaDescription", "ogTitle", "ogDescription", "ogImage", "twitterCardImage", "canonicalDomain"] as (keyof SeoSettings)[]).map((k) => (
                <div key={k} style={k.includes("Description") ? { gridColumn: "1 / -1" } : {}}>
                  <label style={label}>{k.replace(/([A-Z])/g, " $1").trim()}</label>
                  {k.includes("Description") ? (
                    <textarea style={textarea} value={settings[k] ?? ""} onChange={set(k)} />
                  ) : (
                    <input style={input} value={settings[k] ?? ""} onChange={set(k)} />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={card}>
            <div style={{ fontWeight: 900, marginBottom: 16 }}>Robots.txt</div>
            <label style={label}>Robots.txt content (leave blank for safe default)</label>
            <textarea
              style={{ ...textarea, minHeight: 160, fontFamily: "monospace" }}
              value={settings.robotsTxt ?? ""}
              onChange={set("robotsTxt")}
              placeholder={"User-agent: *\nAllow: /\n\nSitemap: https://8fold.app/api/public/sitemap.xml"}
            />
          </div>

          <div style={card}>
            <div style={{ fontWeight: 900, marginBottom: 16 }}>Tracking & Indexing Keys</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              {(["ga4MeasurementId", "metaPixelId", "indexNowKey"] as (keyof SeoSettings)[]).map((k) => (
                <div key={k}>
                  <label style={label}>{k.replace(/([A-Z])/g, " $1").trim()}</label>
                  <input style={input} value={settings[k] ?? ""} onChange={set(k)} placeholder={k === "ga4MeasurementId" ? "G-XXXXXXXXXX" : k === "metaPixelId" ? "1234567890" : "your-key-here"} />
                </div>
              ))}
            </div>
          </div>

          <button style={btn} onClick={() => void saveSettings()} disabled={saving}>
            {saving ? "Saving…" : "Save Global Settings"}
          </button>
        </div>
      )}

      {!loading && activeTab === "templates" && (
        <div>
          <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
            Available variables: <code>{"{City}"}</code> <code>{"{Province}"}</code> <code>{"{Service}"}</code> <code>{"{Category}"}</code> <code>{"{ContractorName}"}</code>
          </p>
          {(["jobs", "services", "cities", "contractors"] as (keyof PageTemplates)[]).map((page) => (
            <div key={page} style={card}>
              <div style={{ fontWeight: 900, marginBottom: 14, textTransform: "capitalize" }}>{page} Pages</div>
              <div style={{ marginBottom: 12 }}>
                <label style={label}>Title Template</label>
                <input style={input} value={templates[page]?.titleTemplate ?? ""} onChange={setTpl(page, "titleTemplate")} placeholder="{Service} in {City} | 8Fold" />
              </div>
              <div>
                <label style={label}>Description Template</label>
                <textarea style={textarea} value={templates[page]?.descriptionTemplate ?? ""} onChange={setTpl(page, "descriptionTemplate")} placeholder="Find trusted {Service} professionals in {City}…" />
              </div>
            </div>
          ))}

          <button style={btn} onClick={() => void saveTemplates()} disabled={saving}>
            {saving ? "Saving…" : "Save Templates"}
          </button>
        </div>
      )}
    </div>
  );
}
