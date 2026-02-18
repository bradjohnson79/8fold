"use client";

import React from "react";
import { apiFetch } from "@/admin/lib/api";
import { Badge } from "@/admin/ui/badges";
import { formatDateTime } from "@/admin/ui/format";
import { PageHeader, RowCard, Card, SecondaryButton } from "@/admin/ui/primitives";
import { AdminColors } from "@/admin/ui/theme";

type RoutingActivityJob = {
  id: string;
  title: string;
  region: string;
  status: string;
  routingStatus?: "UNROUTED" | "ROUTED_BY_ROUTER" | "ROUTED_BY_ADMIN" | null;
  routerId: string | null;
  routerName: string | null;
  routerEmail: string | null;
  adminRoutedById: string | null;
  adminRoutedByEmail: string | null;
  routedAt: string | null;
  firstRoutedAt: string | null;
  claimedAt: string | null;
  dispatchedContractorsCount: number;
  guaranteeEligibleAt: string | null;
  contactedAt: string | null;
  publishedAt: string;
};

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0h";
  const totalMins = Math.ceil(ms / 60000);
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins - days * 60 * 24) / 60);
  const mins = totalMins % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function getRoutingStatus(
  status: RoutingActivityJob["routingStatus"]
): "UNROUTED" | "ROUTED_BY_ROUTER" | "ROUTED_BY_ADMIN" {
  if (status === "ROUTED_BY_ROUTER" || status === "ROUTED_BY_ADMIN") return status;
  return "UNROUTED";
}

function routingStatusLabel(status: RoutingActivityJob["routingStatus"]): string {
  const safeStatus = getRoutingStatus(status);
  if (safeStatus === "ROUTED_BY_ROUTER") return "Routed by Router";
  if (safeStatus === "ROUTED_BY_ADMIN") return "Routed by Admin";
  return "Unrouted";
}

function routingStatusTone(
  status: RoutingActivityJob["routingStatus"]
): "neutral" | "warn" | "ok" | "info" {
  const safeStatus = getRoutingStatus(status);
  if (safeStatus === "ROUTED_BY_ROUTER" || safeStatus === "ROUTED_BY_ADMIN") return "ok";
  return "info";
}

function calculateCountdown(job: RoutingActivityJob): string | null {
  if (job.contactedAt) return null;
  if (!job.guaranteeEligibleAt) return null;
  const now = Date.now();
  const eligibleMs = new Date(job.guaranteeEligibleAt).getTime();
  if (now >= eligibleMs) return null;
  return formatCountdown(eligibleMs - now);
}

export default function AssignmentsPage() {
  const [jobs, setJobs] = React.useState<RoutingActivityJob[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  async function loadRoutingActivity() {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ jobs: RoutingActivityJob[] }>("/api/admin/routing-activity");
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      const message = err.message.toLowerCase();
      if (message.includes("404") || message.includes("not found")) {
        setJobs([]);
        setError("");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void loadRoutingActivity();
  }, []);

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <PageHeader
        eyebrow="Operations"
        title="Routing Activity"
        subtitle="Read-only view of job routing state. Routing occurs on the Jobs page."
        right={
          <SecondaryButton onClick={() => void loadRoutingActivity()} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </SecondaryButton>
        }
      />

      {error ? (
        <Card style={{ marginBottom: 14, borderColor: AdminColors.danger }}>
          <div style={{ color: AdminColors.danger, fontWeight: 900 }}>{error}</div>
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <div style={{ color: AdminColors.muted }}>Loading routing activity...</div>
        </Card>
      ) : jobs.length === 0 ? (
        <Card>
          <div style={{ color: AdminColors.muted, fontSize: 14, lineHeight: "22px" }}>
            No routing data yet. Jobs are routed on the Jobs page.
          </div>
        </Card>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {jobs.map((job) => {
            const routerDisplay = job.adminRoutedByEmail
              ? `${job.adminRoutedByEmail} (Admin)`
              : job.routerName || job.routerEmail || "Unclaimed";
            const countdown = calculateCountdown(job);
            const isClaimed = Boolean(job.routerId || job.adminRoutedById);

            return (
              <RowCard key={job.id} style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 320, flex: 1 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                      <a
                        href={`/admin/jobs/${job?.id ?? ""}`}
                        style={{
                          fontSize: 16,
                          fontWeight: 900,
                          color: AdminColors.text,
                          textDecoration: "none",
                        }}
                      >
                        {job?.title ?? "—"}
                      </a>
                      <Badge
                        label={routingStatusLabel(job.routingStatus ?? null)}
                        tone={routingStatusTone(job.routingStatus ?? null)}
                      />
                      {isClaimed ? <Badge label="Claimed" tone="ok" /> : <Badge label="Unclaimed" tone="neutral" />}
                    </div>
                    <div style={{ color: AdminColors.muted, marginTop: 6, fontSize: 13, lineHeight: "20px" }}>
                      {job.region} • {job.status}
                    </div>
                    <div
                      style={{
                        color: AdminColors.muted,
                        marginTop: 10,
                        fontSize: 12,
                        display: "flex",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <span>
                        <strong>Router:</strong> {routerDisplay}
                      </span>
                      <span>
                        <strong>Dispatched:</strong> {job.dispatchedContractorsCount}/5 contractors
                      </span>
                      {job.routedAt ? (
                        <span>
                          <strong>Routed:</strong> {formatDateTime(job.routedAt)}
                        </span>
                      ) : null}
                      {job.claimedAt ? (
                        <span>
                          <strong>Claimed:</strong> {formatDateTime(job.claimedAt)}
                        </span>
                      ) : null}
                      {countdown ? (
                        <span style={{ color: AdminColors.green, fontWeight: 900 }}>
                          <strong>Guarantee:</strong> Eligible in {countdown}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <SecondaryButton onClick={() => (window.location.href = `/admin/jobs/${job?.id ?? ""}`)}>
                      View Job
                    </SecondaryButton>
                  </div>
                </div>
              </RowCard>
            );
          })}
        </div>
      )}
    </main>
  );
}

