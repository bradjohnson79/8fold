"use client";

import React from "react";
import { apiFetch } from "@/admin/lib/api";
import { PageHeader, Card, PrimaryButton, SecondaryButton } from "@/admin/ui/primitives";
import { AdminColors } from "@/admin/ui/theme";
import { formatDateTime } from "@/admin/ui/format";

type Config = {
  enabled: boolean;
  jobsPerCycle: number;
  intervalHours: number;
};

type RegionRow = {
  country: string;
  regionCode: string;
  mockJobCount: number;
  lastRefreshAt: string | null;
};

export default function SettingsPage() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");

  const [config, setConfig] = React.useState<Config>({
    enabled: true,
    jobsPerCycle: 5,
    intervalHours: 48,
  });
  const [configUpdatedAt, setConfigUpdatedAt] = React.useState<string | null>(null);
  const [regions, setRegions] = React.useState<RegionRow[]>([]);

  async function load() {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const data = await apiFetch<{ config: Config; configUpdatedAt: string | null; regions: RegionRow[] }>(
        "/api/admin/settings/mock-refresh"
      );
      setConfig(
        data.config
          ? {
              enabled: Boolean(data.config.enabled),
              jobsPerCycle: Number(data.config.jobsPerCycle) || 5,
              intervalHours: Number(data.config.intervalHours) || 24,
            }
          : { enabled: true, jobsPerCycle: 5, intervalHours: 48 }
      );
      setConfigUpdatedAt(data.configUpdatedAt);
      setRegions(Array.isArray(data.regions) ? data.regions : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const body: Config = {
        enabled: Boolean(config.enabled),
        jobsPerCycle: Number(config.jobsPerCycle),
        intervalHours: Number(config.intervalHours),
      };
      await apiFetch("/api/admin/settings/mock-refresh", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setNotice("Saved.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <PageHeader
        eyebrow="System"
        title="Settings"
        subtitle="Quiet operational controls."
        right={
          <SecondaryButton onClick={() => void load()} disabled={loading || saving}>
            {loading ? "Loading..." : "Refresh"}
          </SecondaryButton>
        }
      />

      {error ? (
        <Card style={{ marginBottom: 14, borderColor: AdminColors.danger }}>
          <div style={{ color: AdminColors.danger, fontWeight: 900 }}>{error}</div>
        </Card>
      ) : null}
      {notice ? (
        <Card style={{ marginBottom: 14, borderColor: AdminColors.greenSoft }}>
          <div style={{ color: AdminColors.green, fontWeight: 900 }}>{notice}</div>
        </Card>
      ) : null}

      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: AdminColors.text, marginBottom: 10 }}>
          Mock job refresh
        </div>
        <div style={{ color: AdminColors.muted, fontSize: 12, marginBottom: 12 }}>
          Last updated: {configUpdatedAt ? formatDateTime(configUpdatedAt) : "—"}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <label style={{ display: "flex", gap: 10, alignItems: "center", color: AdminColors.text, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => setConfig((c) => ({ ...c, enabled: e.target.checked }))}
            />
            Enabled
          </label>

          <div>
            <div style={{ fontSize: 12, color: AdminColors.muted, marginBottom: 6 }}>Jobs per cycle (per region)</div>
            <input
              value={String(config.jobsPerCycle)}
              onChange={(e) => setConfig((c) => ({ ...c, jobsPerCycle: Number(e.target.value) }))}
              inputMode="numeric"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 12,
                border: `1px solid ${AdminColors.border}`,
                background: AdminColors.card,
                color: AdminColors.text,
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, color: AdminColors.muted, marginBottom: 6 }}>Refresh interval (hours)</div>
            <input
              value={String(config.intervalHours)}
              onChange={(e) => setConfig((c) => ({ ...c, intervalHours: Number(e.target.value) }))}
              inputMode="numeric"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 12,
                border: `1px solid ${AdminColors.border}`,
                background: AdminColors.card,
                color: AdminColors.text,
              }}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <PrimaryButton disabled={saving || loading} onClick={() => void save()}>
            {saving ? "Saving..." : "Save"}
          </PrimaryButton>
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 10 }}>Regions</div>
        {regions.length === 0 ? (
          <div style={{ color: AdminColors.muted, fontSize: 13 }}>No regions.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {regions.map((r) => (
              <div
                key={`${r.country}-${r.regionCode}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: 12,
                  borderRadius: 12,
                  border: `1px solid ${AdminColors.border}`,
                }}
              >
                <div style={{ fontWeight: 900 }}>
                  {r.country}-{r.regionCode}
                </div>
                <div style={{ color: AdminColors.muted, fontSize: 12 }}>
                  jobs {r.mockJobCount} • last refresh {r.lastRefreshAt ? formatDateTime(r.lastRefreshAt) : "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}

