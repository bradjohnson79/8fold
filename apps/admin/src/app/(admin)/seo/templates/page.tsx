"use client";

import { useCallback, useEffect, useState } from "react";

type TemplateData = { titleTemplate: string; descriptionTemplate: string };
type Templates = Record<string, TemplateData>;

const TEMPLATE_LABELS: Record<string, string> = {
  job_page: "Job Page",
  contractor_profile: "Contractor Profile",
  location_page: "Location Page",
  service_page: "Service Page",
};

const card: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 16,
  padding: 20,
  background: "rgba(2,6,23,0.35)",
  marginBottom: 16,
};
const input: React.CSSProperties = {
  width: "100%",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.2)",
  background: "rgba(2,6,23,0.35)",
  color: "rgba(226,232,240,0.92)",
  padding: "8px 10px",
  boxSizing: "border-box",
};
const label: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 700,
  color: "rgba(226,232,240,0.85)",
  marginBottom: 6,
};
const btn: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(134,239,172,0.4)",
  background: "rgba(134,239,172,0.12)",
  color: "rgba(134,239,172,0.95)",
  padding: "9px 20px",
  fontWeight: 900,
  cursor: "pointer",
  fontSize: 14,
};

export default function SeoTemplatesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [templates, setTemplates] = useState<Templates>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/v4/seo/template-pages", { cache: "no-store" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        setError(String(json?.error?.message ?? "Failed to load templates"));
        return;
      }
      setTemplates(json.data?.templates ?? {});
    } catch {
      setError("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function setTemplate(key: string, field: "titleTemplate" | "descriptionTemplate", value: string) {
    setTemplates((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? { titleTemplate: "", descriptionTemplate: "" }), [field]: value },
    }));
    setSaveStatus("idle");
  }

  async function handleSave() {
    setSaving(true);
    setSaveStatus("idle");
    try {
      const resp = await fetch("/api/admin/v4/seo/template-pages", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(templates),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        setSaveStatus("error");
        return;
      }
      setTemplates(json.data?.templates ?? {});
      setSaveStatus("success");
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ marginTop: 24 }}>Loading templates...</div>;
  if (error) {
    return (
      <div style={{ marginTop: 24 }}>
        <div style={{ color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{error}</div>
        <button style={{ ...btn, marginTop: 8 }} onClick={() => void load()}>Retry</button>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>SEO Templates</h1>
      <p style={{ marginTop: 6, color: "rgba(226,232,240,0.72)", maxWidth: 640 }}>
        Edit title and description templates for job pages, contractor profiles, location pages, and service pages.
        Variables: {"{job_title}"}, {"{city}"}, {"{region}"}, {"{trade}"}, {"{contractor_name}"}, {"{platform_name}"}
      </p>

      {["job_page", "contractor_profile", "location_page", "service_page"].map((key) => (
        <div key={key} style={card}>
          <div style={{ fontWeight: 900, marginBottom: 14 }}>{TEMPLATE_LABELS[key] ?? key}</div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Title Template</label>
            <input
              style={input}
              value={templates[key]?.titleTemplate ?? ""}
              onChange={(e) => setTemplate(key, "titleTemplate", e.target.value)}
              placeholder={`{job_title} in {city}, {region} | 8Fold`}
            />
          </div>
          <div>
            <label style={label}>Description Template</label>
            <textarea
              style={{ ...input, resize: "vertical", minHeight: 80 }}
              value={templates[key]?.descriptionTemplate ?? ""}
              onChange={(e) => setTemplate(key, "descriptionTemplate", e.target.value)}
              placeholder="Find trusted {trade} professionals in {city}..."
            />
          </div>
        </div>
      ))}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
        <button style={btn} onClick={() => void handleSave()} disabled={saving}>
          {saving ? "Saving..." : "Save Templates"}
        </button>
        {saveStatus === "success" && (
          <span style={{ color: "rgba(134,239,172,0.95)", fontWeight: 700 }}>Saved successfully</span>
        )}
        {saveStatus === "error" && (
          <span style={{ color: "rgba(254,202,202,0.95)", fontWeight: 700 }}>Failed to save</span>
        )}
      </div>
    </div>
  );
}
