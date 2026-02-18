import { redirect } from "next/navigation";
import { adminApiFetch } from "@/server/adminApi";
import { JobActionGuards } from "@/components/admin/JobActionGuards";
import { AdminActionsLogClient } from "@/components/admin/AdminActionsLogClient";

type JobDetail = any;
type AuditLogRow = any;

async function act(formData: FormData) {
  "use server";
  const jobId = String(formData.get("jobId") ?? "").trim();
  const kind = String(formData.get("kind") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const archiveReason = String(formData.get("archiveReason") ?? "").trim();
  const againstRole = String(formData.get("againstRole") ?? "").trim();
  const disputeReason = String(formData.get("disputeReason") ?? "").trim();
  const desc = String(formData.get("description") ?? "").trim();

  if (!jobId || !kind) redirect("/jobs");

  try {
    if (kind === "archive") {
      await adminApiFetch(`/api/admin/jobs/${encodeURIComponent(jobId)}/archive`, {
        method: "PATCH",
        body: JSON.stringify({ reason: archiveReason || reason || "Archived by admin" }),
      });
      // Redirect to Jobs list with an explicit archived filter so it doesn't "disappear".
      redirect(`/jobs?archived=true&q=${encodeURIComponent(jobId)}&msg=archived`);
    }
    if (kind === "refund") {
      await adminApiFetch(`/api/admin/jobs/${encodeURIComponent(jobId)}/refund`, { method: "POST" });
      redirect(`/jobs/${encodeURIComponent(jobId)}?msg=refund_requested`);
    }
    if (kind === "force_approve") {
      await adminApiFetch(`/api/admin/jobs/${encodeURIComponent(jobId)}/complete`, {
        method: "POST",
        body: JSON.stringify({ override: true, reason: reason || "Admin override" }),
      });
      redirect(`/jobs/${encodeURIComponent(jobId)}?msg=force_approved`);
    }
    if (kind === "reroute") {
      await adminApiFetch(`/api/admin/router/jobs/${encodeURIComponent(jobId)}/route`, { method: "POST" });
      redirect(`/jobs/${encodeURIComponent(jobId)}?msg=rerouted`);
    }
    if (kind === "escalate_dispute") {
      await adminApiFetch(`/api/admin/jobs/${encodeURIComponent(jobId)}/escalate-dispute`, {
        method: "POST",
        body: JSON.stringify({
          againstRole: againstRole || "CONTRACTOR",
          disputeReason: disputeReason || "OTHER",
          description: desc || reason || "Escalated by admin.",
          priority: "HIGH",
        }),
      });
      redirect(`/jobs/${encodeURIComponent(jobId)}?msg=dispute_escalated`);
    }
    if (kind === "release") {
      await adminApiFetch(`/api/admin/jobs/${encodeURIComponent(jobId)}/release`, { method: "POST" });
      redirect(`/jobs/${encodeURIComponent(jobId)}?msg=release_attempted`);
    }
  } catch (e) {
    const m = e instanceof Error ? e.message : "action_failed";
    redirect(`/jobs/${encodeURIComponent(jobId)}?err=${encodeURIComponent(m)}`);
  }

  redirect(`/jobs/${encodeURIComponent(jobId)}`);
}

function Card(props: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid rgba(148,163,184,0.14)",
        borderRadius: 16,
        padding: 14,
        background: "rgba(2,6,23,0.35)",
      }}
    >
      <div style={{ fontWeight: 950, color: "rgba(226,232,240,0.95)" }}>{props.title}</div>
      <div style={{ marginTop: 10, color: "rgba(226,232,240,0.90)" }}>{props.children}</div>
    </div>
  );
}

function kv(label: string, value: React.ReactNode) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "170px 1fr", gap: 10, padding: "6px 0" }}>
      <div style={{ color: "rgba(226,232,240,0.65)", fontSize: 12, fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(226,232,240,0.92)" }}>{value}</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "rgba(2,6,23,0.35)",
  border: "1px solid rgba(148,163,184,0.14)",
  color: "rgba(226,232,240,0.92)",
  borderRadius: 12,
  padding: "9px 10px",
  fontSize: 13,
  width: "100%",
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
};

const dangerButtonStyle: React.CSSProperties = {
  background: "rgba(248,113,113,0.16)",
  border: "1px solid rgba(248,113,113,0.35)",
  color: "rgba(254,202,202,0.95)",
  borderRadius: 12,
  padding: "9px 12px",
  fontSize: 13,
  fontWeight: 950,
  cursor: "pointer",
};

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const msg = String(Array.isArray((sp as any).msg) ? (sp as any).msg[0] : (sp as any).msg ?? "").trim();
  const err = String(Array.isArray((sp as any).err) ? (sp as any).err[0] : (sp as any).err ?? "").trim();

  let job: JobDetail | null = null;
  let loadErr: string | null = null;
  try {
    job = await adminApiFetch<JobDetail>(`/api/admin/jobs/${encodeURIComponent(id)}`);
  } catch (e) {
    loadErr = e instanceof Error ? e.message : "Failed to load job";
  }

  if (loadErr) {
    return (
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Job</h1>
        <p style={{ marginTop: 10, color: "rgba(254,202,202,0.95)" }}>{loadErr}</p>
        <a href="/jobs" style={{ color: "rgba(191,219,254,0.95)", fontWeight: 900, textDecoration: "none" }}>
          ← Back to Jobs
        </a>
      </div>
    );
  }

  const j: any = job!;
  let adminTier: "ADMIN_VIEWER" | "ADMIN_OPERATOR" | "ADMIN_SUPER" = "ADMIN_OPERATOR";
  try {
    const me = await adminApiFetch<{ adminTier: "ADMIN_VIEWER" | "ADMIN_OPERATOR" | "ADMIN_SUPER" }>(`/api/admin/me`);
    adminTier = (me as any)?.adminTier ?? "ADMIN_OPERATOR";
  } catch {
    adminTier = "ADMIN_OPERATOR";
  }
  let auditLogs: AuditLogRow[] = [];
  try {
    const al = await adminApiFetch<{ auditLogs: AuditLogRow[] }>(
      `/api/admin/audit-logs?entityType=Job&entityId=${encodeURIComponent(String(j.id))}&take=30`,
    );
    auditLogs = (al as any)?.auditLogs ?? [];
  } catch {
    auditLogs = [];
  }

  const actorLabel = (al: any) => al?.actor?.email ?? al?.actor?.name ?? al?.actorUserId ?? null;
  const findLast = (match: (a: string) => boolean) => {
    const hit = auditLogs.find((x: any) => match(String(x?.action ?? "")));
    if (!hit) return null;
    return { whenIso: hit.createdAt ? String(hit.createdAt) : null, actorLabel: actorLabel(hit) };
  };
  const lastActors = {
    forceApprove: findLast((a) => a === "JOB_ADMIN_OVERRIDE_COMPLETE_APPROVED"),
    refund: findLast((a) => a === "ADMIN_JOB_REFUND"),
    manualRelease: findLast((a) => a.includes("RELEASE")),
    archive: (() => {
      const hit = auditLogs.find((x: any) => String(x?.action ?? "") === "ADMIN_JOB_ARCHIVE");
      if (!hit) return null;
      return {
        whenIso: hit.createdAt ? String(hit.createdAt) : null,
        actorLabel: actorLabel(hit),
        reason: hit?.metadata?.reason ? String(hit.metadata.reason) : null,
      };
    })(),
  } as any;

  const archiveReasonFromLog = lastActors.archive?.reason ?? null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950, letterSpacing: 0.2 }}>Job</h1>
          <div style={{ marginTop: 6, color: "rgba(226,232,240,0.72)" }}>
            <a href="/jobs" style={{ color: "rgba(191,219,254,0.95)", textDecoration: "none", fontWeight: 900 }}>
              ← Back
            </a>
          </div>
        </div>
        <div style={{ color: "rgba(226,232,240,0.72)", fontSize: 12 }}>
          ID: <code>{j.id}</code>
        </div>
      </div>

      {msg ? <div style={{ marginTop: 10, color: "rgba(134,239,172,0.95)", fontWeight: 900 }}>{msg}</div> : null}
      {err ? <div style={{ marginTop: 10, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{err}</div> : null}

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        <Card title="Core">
          {kv("Title", j.title ?? "—")}
          {kv("Status", j.status ?? "—")}
          {kv("Archived", j.archived ? "true" : "false")}
          {j.archived ? kv("Archive reason", archiveReasonFromLog ?? "—") : null}
          {kv("Routing", j.routingStatus ?? "—")}
          {kv("Country", j.country ?? "—")}
          {kv("State/Province", j.regionCode ?? j.region ?? "—")}
          {kv("City", j.city ?? "—")}
          {kv("Address", j.addressFull ?? "—")}
          {kv("Trade", j.tradeCategory ?? "—")}
          {kv("Source", j.jobSource ?? "—")}
          {kv("Created", String(j.createdAt ?? "").slice(0, 19).replace("T", " "))}
          {kv("Published", String(j.publishedAt ?? "").slice(0, 19).replace("T", " "))}
          {kv("Routing due", j.routingDueAt ? String(j.routingDueAt).slice(0, 19).replace("T", " ") : "—")}
        </Card>

        <Card title="Money / Stripe">
          {kv("Amount", typeof j.amountCents === "number" ? `$${(j.amountCents / 100).toFixed(2)}` : "—")}
          {kv("Payment status", j.paymentStatus ?? "—")}
          {kv("Payout status", j.payoutStatus ?? "—")}
          {kv("Stripe PI", j.stripePaymentIntentId ?? "—")}
          {kv("Stripe charge", j.stripeChargeId ?? "—")}
          {kv("Contractor transfer", j.contractorTransferId ?? "—")}
          {kv("Router transfer", j.routerTransferId ?? "—")}
          {kv("Funded at", j.fundedAt ? String(j.fundedAt).slice(0, 19).replace("T", " ") : "—")}
          {kv("Released at", j.releasedAt ? String(j.releasedAt).slice(0, 19).replace("T", " ") : "—")}
          {kv("Refunded at", j.refundedAt ? String(j.refundedAt).slice(0, 19).replace("T", " ") : "—")}

          <form action={act} style={{ marginTop: 10 }}>
            <input type="hidden" name="jobId" value={j.id} />
            <input type="hidden" name="kind" value="release" />
            <button type="submit" style={buttonStyle}>
              Retry release (idempotent)
            </button>
          </form>
        </Card>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <Card title="Operational actions">
          <div style={{ color: "rgba(226,232,240,0.72)", fontSize: 13, lineHeight: "20px" }}>
            Actions that change routing/support state (non-financial). Tiered authority is enforced server-side.
          </div>
          {adminTier === "ADMIN_VIEWER" ? (
            <div style={{ marginTop: 10, color: "rgba(226,232,240,0.65)" }}>Viewer tier: mutations are hidden.</div>
          ) : (
            <form action={act} style={{ marginTop: 10 }}>
              <input type="hidden" name="jobId" value={j.id} />
              <input type="hidden" name="kind" value="reroute" />
              <button type="submit" style={buttonStyle}>
                Re-route (failsafe)
              </button>
            </form>
          )}
        </Card>

        <Card title="High Impact Actions">
          <div style={{ color: "rgba(254,202,202,0.90)", fontSize: 13, lineHeight: "20px", fontWeight: 900 }}>
            High impact actions (financial / override). Always preview (dry run) then confirm.
          </div>
          <div style={{ marginTop: 10 }}>
            <JobActionGuards
              jobId={String(j.id)}
              jobStatus={j.status ?? null}
              payoutStatus={j.payoutStatus ?? null}
              archived={Boolean(j.archived)}
              adminTier={adminTier}
              lastActors={lastActors}
              act={act}
            />
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
        <Card title="Dispute escalation">
          <div style={{ color: "rgba(226,232,240,0.72)", fontSize: 13, lineHeight: "20px" }}>
            Creates a Support DISPUTE ticket + DisputeCase (72h deadline default).
          </div>
          {adminTier === "ADMIN_VIEWER" ? (
            <div style={{ marginTop: 10, color: "rgba(226,232,240,0.65)" }}>Viewer tier: mutations are hidden.</div>
          ) : (
            <form action={act} style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <input type="hidden" name="jobId" value={j.id} />
              <input type="hidden" name="kind" value="escalate_dispute" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <select name="againstRole" defaultValue="CONTRACTOR" style={inputStyle} aria-label="Against role">
                  <option value="CONTRACTOR">Against Contractor</option>
                  <option value="JOB_POSTER">Against Job Poster</option>
                </select>
                <select name="disputeReason" defaultValue="OTHER" style={inputStyle} aria-label="Dispute reason">
                  <option value="PRICING">PRICING</option>
                  <option value="WORK_QUALITY">WORK_QUALITY</option>
                  <option value="NO_SHOW">NO_SHOW</option>
                  <option value="PAYMENT">PAYMENT</option>
                  <option value="OTHER">OTHER</option>
                </select>
              </div>
              <textarea name="description" placeholder="Escalation description (required)" rows={3} style={inputStyle} />
              <button type="submit" style={dangerButtonStyle}>
                Escalate dispute
              </button>
            </form>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 12 }}>
        <Card title="Admin Actions Log">
          <div style={{ color: "rgba(226,232,240,0.72)", fontSize: 12 }}>
            Recent audit events for this job (server-side). This makes admin interventions reviewable.
          </div>
          <div style={{ marginTop: 10 }}>
            <AdminActionsLogClient rows={auditLogs as any} />
          </div>
        </Card>
      </div>
    </div>
  );
}

