"use client";

import { useCallback, useEffect, useState } from "react";

interface SeoSettings {
  id?: string;
  metaPixelId?: string | null;
  ga4MeasurementId?: string | null;
  indexNowKey?: string | null;
  canonicalDomain?: string | null;
  robotsTxt?: string | null;
  ogImage?: string | null;
  twitterCardImage?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

interface ValidationErrors {
  metaPixelId?: string;
  ga4MeasurementId?: string;
  indexNowKey?: string;
  canonicalDomain?: string;
  ogImage?: string;
  twitterCardImage?: string;
}

function validate(form: SeoSettings): ValidationErrors {
  const errs: ValidationErrors = {};
  if (form.metaPixelId && !/^\d+$/.test(form.metaPixelId)) {
    errs.metaPixelId = "Must contain only digits";
  }
  if (form.ga4MeasurementId && !/^G-[A-Z0-9]+$/.test(form.ga4MeasurementId)) {
    errs.ga4MeasurementId = "Must be in G-XXXXXXXXXX format (uppercase)";
  }
  if (form.indexNowKey) {
    if (form.indexNowKey.length < 32) errs.indexNowKey = "Must be at least 32 characters";
    else if (form.indexNowKey.length > 128) errs.indexNowKey = "Must be at most 128 characters";
  }
  if (form.canonicalDomain) {
    const cleaned = form.canonicalDomain.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    if (!cleaned || cleaned.length < 3) errs.canonicalDomain = "Enter a valid hostname (e.g. 8fold.app)";
  }
  if (form.ogImage && form.ogImage.trim()) {
    try { new URL(form.ogImage); } catch { errs.ogImage = "Must be a valid URL"; }
  }
  if (form.twitterCardImage && form.twitterCardImage.trim()) {
    try { new URL(form.twitterCardImage); } catch { errs.twitterCardImage = "Must be a valid URL"; }
  }
  return errs;
}

export default function SeoEnginePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  const [form, setForm] = useState<SeoSettings>({
    metaPixelId: "",
    ga4MeasurementId: "",
    indexNowKey: "",
    canonicalDomain: "",
    robotsTxt: "",
    ogImage: "",
    twitterCardImage: "",
  });
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const resp = await fetch("/api/admin/v4/seo/settings", { cache: "no-store" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json) {
        setLoadError(String(json?.error?.message ?? json?.error ?? "Failed to load SEO settings"));
        return;
      }
      const data: SeoSettings = json.data ?? {};
      setForm({
        metaPixelId: data.metaPixelId ?? "",
        ga4MeasurementId: data.ga4MeasurementId ?? "",
        indexNowKey: data.indexNowKey ?? "",
        canonicalDomain: data.canonicalDomain ?? "",
        robotsTxt: data.robotsTxt ?? "",
        ogImage: data.ogImage ?? "",
        twitterCardImage: data.twitterCardImage ?? "",
      });
      if (data.updatedAt) setLastUpdated(new Date(data.updatedAt).toLocaleString());
    } catch {
      setLoadError("Failed to load SEO settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function setField(key: keyof SeoSettings, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaveStatus("idle");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveStatus("idle");
    setSaveError(null);

    const errs = validate(form);
    setValidationErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      const body = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, v === "" ? null : v]),
      );
      const resp = await fetch("/api/admin/v4/seo/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) {
        setSaveStatus("error");
        setSaveError(String(json?.error?.message ?? json?.error ?? "Failed to save"));
        return;
      }
      const data: SeoSettings = json.data ?? {};
      if (data.updatedAt) setLastUpdated(new Date(data.updatedAt).toLocaleString());
      setSaveStatus("success");
    } catch {
      setSaveStatus("error");
      setSaveError("Failed to save SEO settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>SEO Engine</h1>
      <p style={{ marginTop: 6, color: "rgba(226,232,240,0.72)", marginBottom: 0 }}>
        Global SEO configuration. Changes take effect within 60 seconds — no redeploy required.
      </p>
      {lastUpdated && (
        <p style={{ marginTop: 4, fontSize: 12, color: "rgba(226,232,240,0.45)" }}>
          Last updated: {lastUpdated}
        </p>
      )}

      {loading && <div style={{ marginTop: 24 }}>Loading SEO settings...</div>}
      {loadError && (
        <div style={{ marginTop: 24 }}>
          <div style={{ color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{loadError}</div>
          <button style={{ ...buttonStyle, marginTop: 8 }} onClick={() => void load()}>Retry</button>
        </div>
      )}

      {!loading && !loadError && (
        <form onSubmit={handleSave} style={{ marginTop: 24, maxWidth: 640 }}>

          {/* ── Tracking ── */}
          <SectionHeader>Tracking</SectionHeader>

          <Field
            label="Meta Pixel ID"
            hint="Digits only — e.g. 123456789012345"
            error={validationErrors.metaPixelId}
          >
            <input
              type="text"
              value={form.metaPixelId ?? ""}
              onChange={(e) => setField("metaPixelId", e.target.value)}
              placeholder="123456789012345"
              style={inputStyle}
            />
          </Field>

          <Field
            label="GA4 Measurement ID"
            hint="Format: G-XXXXXXXXXX (uppercase)"
            error={validationErrors.ga4MeasurementId}
          >
            <input
              type="text"
              value={form.ga4MeasurementId ?? ""}
              onChange={(e) => setField("ga4MeasurementId", e.target.value.toUpperCase())}
              placeholder="G-XXXXXXXXXX"
              style={inputStyle}
            />
          </Field>

          {/* ── IndexNow ── */}
          <SectionHeader>IndexNow</SectionHeader>

          <Field
            label="IndexNow Key"
            hint="32–128 characters. Generate at bing.com/indexnow or indexnow.org"
            error={validationErrors.indexNowKey}
          >
            <input
              type="text"
              value={form.indexNowKey ?? ""}
              onChange={(e) => setField("indexNowKey", e.target.value)}
              placeholder="a1b2c3d4... (hex key)"
              style={inputStyle}
            />
          </Field>

          <Field
            label="Canonical Domain"
            hint="Hostname only — e.g. 8fold.app (no https:// or trailing slash)"
            error={validationErrors.canonicalDomain}
          >
            <input
              type="text"
              value={form.canonicalDomain ?? ""}
              onChange={(e) => setField("canonicalDomain", e.target.value)}
              placeholder="8fold.app"
              style={inputStyle}
            />
          </Field>

          {/* ── Crawl Control ── */}
          <SectionHeader>Crawl Control</SectionHeader>

          <Field
            label="Robots.txt"
            hint="Full content of robots.txt — leave blank for default (Allow: *)"
          >
            <textarea
              value={form.robotsTxt ?? ""}
              onChange={(e) => setField("robotsTxt", e.target.value)}
              rows={6}
              placeholder={`User-agent: *\nAllow: /\n\nSitemap: https://8fold.app/sitemap.xml`}
              style={{ ...inputStyle, width: "100%", resize: "vertical", fontFamily: "monospace", fontSize: 12 }}
            />
          </Field>

          {/* ── Social Media ── */}
          <SectionHeader>Social Media</SectionHeader>

          <Field
            label="OG Image URL"
            hint="Open Graph image for link previews (Facebook, LinkedIn)"
            error={validationErrors.ogImage}
          >
            <input
              type="url"
              value={form.ogImage ?? ""}
              onChange={(e) => setField("ogImage", e.target.value)}
              placeholder="https://8fold.app/og-image.jpg"
              style={inputStyle}
            />
          </Field>

          <Field
            label="Twitter Card Image URL"
            hint="Twitter/X card preview image"
            error={validationErrors.twitterCardImage}
          >
            <input
              type="url"
              value={form.twitterCardImage ?? ""}
              onChange={(e) => setField("twitterCardImage", e.target.value)}
              placeholder="https://8fold.app/twitter-card.jpg"
              style={inputStyle}
            />
          </Field>

          {/* ── Save ── */}
          <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 12 }}>
            <button type="submit" style={saveButtonStyle} disabled={saving}>
              {saving ? "Saving..." : "Save SEO Settings"}
            </button>
            {saveStatus === "success" && (
              <span style={{ color: "rgba(134,239,172,0.95)", fontWeight: 700 }}>
                Saved successfully
              </span>
            )}
            {saveStatus === "error" && (
              <span style={{ color: "rgba(254,202,202,0.95)", fontWeight: 700 }}>
                {saveError ?? "Failed to save"}
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      marginTop: 24,
      marginBottom: 12,
      paddingBottom: 6,
      borderBottom: "1px solid rgba(148,163,184,0.18)",
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      color: "rgba(148,163,184,0.7)",
    }}>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ marginTop: 6 }}>{children}</div>
      {hint && !error && (
        <div style={{ marginTop: 4, fontSize: 11, color: "rgba(148,163,184,0.65)" }}>{hint}</div>
      )}
      {error && (
        <div style={{ marginTop: 4, fontSize: 12, color: "rgba(254,202,202,0.9)", fontWeight: 700 }}>{error}</div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.2)",
  background: "rgba(2,6,23,0.35)",
  color: "rgba(226,232,240,0.92)",
  padding: "8px 10px",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 700,
  color: "rgba(226,232,240,0.85)",
};

const buttonStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(56,189,248,0.4)",
  background: "rgba(56,189,248,0.14)",
  color: "rgba(125,211,252,0.95)",
  padding: "7px 14px",
  fontWeight: 900,
  cursor: "pointer",
};

const saveButtonStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(134,239,172,0.4)",
  background: "rgba(134,239,172,0.12)",
  color: "rgba(134,239,172,0.95)",
  padding: "9px 20px",
  fontWeight: 900,
  cursor: "pointer",
  fontSize: 14,
};
