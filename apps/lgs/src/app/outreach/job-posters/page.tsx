"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type JobCampaign = {
  id: string;
  name: string;
  campaignType?: "contractor" | "jobs";
  sentCount?: number;
  replyCount?: number;
  bounceCount?: number;
  uniqueDomains?: number;
  status?: string;
};

export default function JobPosterOutreachPage() {
  const [campaigns, setCampaigns] = useState<JobCampaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"generate" | "queue" | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/lgs/leads/finder/campaigns");
      const json = await res.json().catch(() => ({})) as { ok?: boolean; data?: JobCampaign[]; error?: string };
      if (!json.ok) {
        setError(json.error ?? "Failed to load campaigns");
        return;
      }
      setCampaigns((json.data ?? []).filter((campaign) => campaign.campaignType === "jobs"));
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(campaignId: string, action: "generate" | "queue") {
    setBusyId(campaignId);
    setBusyAction(action);
    setError(null);
    try {
      const endpoint =
        action === "generate"
          ? "/api/lgs/outreach/job-posters/generate"
          : "/api/lgs/outreach/job-posters/queue";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: campaignId }),
      });
      const json = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? `Failed to ${action}`);
      } else {
        await load();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ margin: "0 0 0.35rem" }}>Job Poster Outreach</h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: "0.9rem" }}>
            Generate, review, queue, and send job-poster outreach without touching the contractor pipeline.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Link href="/outreach/job-posters/review" style={{ padding: "0.6rem 1rem", background: "#1e293b", borderRadius: 8 }}>
            Review
          </Link>
          <Link href="/outreach/job-posters/queue" style={{ padding: "0.6rem 1rem", background: "#1e293b", borderRadius: 8 }}>
            Queue
          </Link>
        </div>
      </div>

      {error && <p style={{ color: "#f87171" }}>{error}</p>}

      {campaigns.length === 0 && !error && (
        <div style={{ padding: "1.5rem", background: "#1e293b", borderRadius: 10, color: "#94a3b8" }}>
          No job-poster campaigns found yet. Start from <Link href="/leads/finder" style={{ color: "#38bdf8" }}>Lead Finder</Link>.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {campaigns.map((campaign) => {
          const generating = busyId === campaign.id && busyAction === "generate";
          const queueing = busyId === campaign.id && busyAction === "queue";
          return (
            <div key={campaign.id} style={{ background: "#1e293b", borderRadius: 10, padding: "1.25rem", border: "1px solid #334155" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 600, color: "#f8fafc", marginBottom: "0.25rem" }}>{campaign.name}</div>
                  <div style={{ color: "#64748b", fontSize: "0.82rem" }}>
                    Status: {campaign.status ?? "draft"} · Domains: {(campaign.uniqueDomains ?? 0).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                  <button
                    onClick={() => runAction(campaign.id, "generate")}
                    disabled={!!busyId}
                    style={{ padding: "0.55rem 0.95rem", background: "#334155", borderRadius: 8, cursor: busyId ? "not-allowed" : "pointer" }}
                  >
                    {generating ? "Generating..." : "Generate Drafts"}
                  </button>
                  <button
                    onClick={() => runAction(campaign.id, "queue")}
                    disabled={!!busyId}
                    style={{ padding: "0.55rem 0.95rem", background: "#3b82f6", color: "#fff", borderRadius: 8, cursor: busyId ? "not-allowed" : "pointer" }}
                  >
                    {queueing ? "Queueing..." : "Queue Approved"}
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "1rem", color: "#94a3b8", fontSize: "0.85rem" }}>
                <span>Sent: {campaign.sentCount ?? 0}</span>
                <span>Replies: {campaign.replyCount ?? 0}</span>
                <span>Bounces: {campaign.bounceCount ?? 0}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
