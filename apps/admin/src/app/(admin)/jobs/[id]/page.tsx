import { adminApiFetch } from "@/server/adminApiV4";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import JobEditForm from "./JobEditForm";
import JobStatusEditor from "./JobStatusEditor";
import AdminRoutingAccordion from "./AdminRoutingAccordion";

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

type Party = { id: string; name: string | null; email: string | null; role: string | null };
type PaymentState = { label: string; rawPaymentStatus: string | null; rawPayoutStatus: string | null };
type JobDetail = {
  id: string;
  title: string;
  description: string;
  scope: string;
  tradeCategory: string;
  country: string;
  regionCode: string | null;
  city: string | null;
  postalCode: string | null;
  addressFull: string | null;
  lat: number | null;
  lng: number | null;
  statusRaw: string;
  displayStatus: string;
  routingStatus: string;
  isMock: boolean;
  jobSource: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  archived: boolean;
  paymentState: PaymentState;
  amountCents: number;
  paymentStatus: string | null;
  payoutStatus: string | null;
  financialSummary: {
    appraisalSubtotalCents: number;
    regionalFeeCents: number;
    taxRateBps: number;
    taxAmountCents: number;
    totalAmountCents: number;
    country: string;
    province: string | null;
    stripePaymentIntentId: string | null;
    stripePaymentIntentStatus: string | null;
    stripePaidAt: string | null;
    stripeRefundedAt: string | null;
    stripeCanceledAt: string | null;
    ledgerByType: Array<{ type: string; count: number; creditsCents: number; debitsCents: number }>;
  };
  jobPoster: Party | null;
  router: Party | null;
  contractor: Party | null;
  adminRoutedById?: string | null;
};

type TimelineEvent = {
  at: string;
  type: string;
  label: string;
  source: "job" | "dispatch" | "assignment" | "audit";
  detail: string | null;
  actor: string | null;
};

type Related = {
  pmRequests: { count: number; latest: string | null };
  receipts: { count: number; latest: string | null };
  messages: { threadCount: number; messageCount: number };
};

type CancelRequest = {
  id: string;
  reason: string;
  requestedByRole: string;
  withinPenaltyWindow: boolean;
  status: string;
  requestedAt: string;
  supportTicketId: string | null;
  refundProcessedAt?: string | null;
  payoutProcessedAt?: string | null;
  suspensionProcessedAt?: string | null;
};

type DetailResp = {
  job: JobDetail;
  timeline: TimelineEvent[];
  related: Related;
  cancelRequest?: CancelRequest | null;
  statusOptions?: string[];
  mutation?: {
    kind: "updated" | "noop";
    previousStatus: string;
    nextStatus: string;
    requestedStatus: string;
    actualStatus: string;
    changed: boolean;
  };
};

function firstQueryValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

function toCanonicalStatus(status: string): string {
  const upper = String(status ?? "").trim().toUpperCase();
  if (upper === "CUSTOMER_APPROVED_AWAITING_ROUTER") return "OPEN_FOR_ROUTING";
  return upper;
}

function money(cents: number) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function fmt(dt: string | null) {
  if (!dt) return "—";
  return dt.slice(0, 19).replace("T", " ");
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid rgba(148,163,184,0.14)",
        borderRadius: 16,
        padding: 14,
        background: "rgba(2,6,23,0.35)",
      }}
    >
      <div style={{ fontWeight: 950, color: "rgba(226,232,240,0.95)" }}>{title}</div>
      <div style={{ marginTop: 10, color: "rgba(226,232,240,0.90)" }}>{children}</div>
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

function partyPath(role: string | null, id: string) {
  const r = String(role ?? "").toUpperCase();
  if (r === "CONTRACTOR") return `/contractors/${encodeURIComponent(id)}`;
  if (r === "JOB_POSTER") return `/job-posters/${encodeURIComponent(id)}`;
  if (r === "ROUTER") return `/routers/${encodeURIComponent(id)}`;
  return null;
}

function PartyLink({ party }: { party: Party | null }) {
  if (!party?.id) return <span>—</span>;
  const href = partyPath(party.role, party.id);
  const label = party.name ?? party.email ?? party.id;
  if (!href) {
    return (
      <div>
        <div>{label}</div>
        <div style={{ color: "rgba(226,232,240,0.65)", fontSize: 12 }}>{party.email ?? "—"}</div>
      </div>
    );
  }
  return (
    <div>
      <a href={href} style={{ color: "rgba(191,219,254,0.95)", textDecoration: "none", fontWeight: 900 }}>
        {label}
      </a>
      <div style={{ color: "rgba(226,232,240,0.65)", fontSize: 12 }}>{party.email ?? "—"}</div>
    </div>
  );
}

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = (await searchParams) ?? {};

  let data: DetailResp | null = null;
  let loadErr: string | null = null;
  try {
    data = await adminApiFetch<DetailResp>(`/api/admin/v4/jobs/${encodeURIComponent(id)}`);
  } catch (e) {
    loadErr = e instanceof Error ? e.message : "Failed to load job";
  }

  if (loadErr || !data) {
    return (
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Job</h1>
        <p style={{ marginTop: 10, color: "rgba(254,202,202,0.95)" }}>{loadErr ?? "Failed to load job"}</p>
        <a href="/jobs" style={{ color: "rgba(191,219,254,0.95)", fontWeight: 900, textDecoration: "none" }}>
          ← Back to Jobs
        </a>
      </div>
    );
  }

  const job = data.job;
  const displayStatus = job.isMock ? "IN_PROGRESS" : job.displayStatus;
  const statusOptions = Array.isArray(data.statusOptions) ? data.statusOptions : [job.statusRaw];
  const allowedStatuses = new Set(statusOptions.map((v) => String(v ?? "").trim().toUpperCase()).filter(Boolean));
  const statusUpdate = firstQueryValue(query.statusUpdate).toLowerCase();
  const statusMessage = firstQueryValue(query.statusMessage);
  const flash =
    statusUpdate === "ok"
      ? { tone: "success" as const, message: statusMessage || "Status updated." }
      : statusUpdate === "error"
        ? { tone: "error" as const, message: statusMessage || "Failed to update status." }
        : null;

  async function updateStatusAction(formData: FormData) {
    "use server";

    const nextStatus = toCanonicalStatus(String(formData.get("status") ?? "").trim());
    const noteRaw = String(formData.get("note") ?? "").trim();
    const note = noteRaw ? noteRaw.slice(0, 500) : undefined;

    if (!nextStatus || !allowedStatuses.has(nextStatus)) {
      const qs = new URLSearchParams({
        statusUpdate: "error",
        statusMessage: "Invalid status selected.",
      });
      redirect(`/jobs/${encodeURIComponent(id)}?${qs.toString()}`);
    }

    try {
      const updated = await adminApiFetch<DetailResp>(`/api/admin/v4/jobs/${encodeURIComponent(id)}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus, note }),
      });

      const mutation = updated.mutation ?? null;
      if (!mutation) {
        const qs = new URLSearchParams({
          statusUpdate: "error",
          statusMessage: "Missing mutation confirmation from server.",
        });
        redirect(`/jobs/${encodeURIComponent(id)}?${qs.toString()}`);
      }
      if (!mutation.changed) {
        const qs = new URLSearchParams({
          statusUpdate: "error",
          statusMessage: `No status change (still ${mutation.actualStatus}).`,
        });
        redirect(`/jobs/${encodeURIComponent(id)}?${qs.toString()}`);
      }
      if (mutation.actualStatus !== nextStatus) {
        const qs = new URLSearchParams({
          statusUpdate: "error",
          statusMessage: `Write verification failed. Expected ${nextStatus}, got ${mutation.actualStatus}.`,
        });
        redirect(`/jobs/${encodeURIComponent(id)}?${qs.toString()}`);
      }

      const qs = new URLSearchParams({
        statusUpdate: "ok",
        statusMessage: `Status updated: ${mutation.previousStatus} -> ${mutation.actualStatus}`,
      });
      revalidatePath(`/jobs/${encodeURIComponent(id)}`);
      redirect(`/jobs/${encodeURIComponent(id)}?${qs.toString()}`);
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Failed to update status";
      const message = raw.trim() || "Failed to update status";
      const qs = new URLSearchParams({
        statusUpdate: "error",
        statusMessage: message.slice(0, 160),
      });
      redirect(`/jobs/${encodeURIComponent(id)}?${qs.toString()}`);
    }
  }

  async function doSuperSuspend(formData: FormData) {
    "use server";
    const duration = String(formData.get("duration") ?? "1m").trim();
    const reason = String(formData.get("reason") ?? "").trim();
    if (!reason) return;
    try {
      await adminApiFetch(`/api/admin/v4/super/jobs/${encodeURIComponent(id)}/suspend`, {
        method: "POST",
        body: JSON.stringify({ duration, reason }),
      });
    } catch {
      // 403 if not ADMIN_SUPER
    }
    revalidatePath(`/jobs/${encodeURIComponent(id)}`);
    redirect(`/jobs/${encodeURIComponent(id)}`);
  }

  async function doSuperArchive(formData: FormData) {
    "use server";
    const reason = String(formData.get("reason") ?? "").trim();
    try {
      await adminApiFetch(`/api/admin/v4/super/jobs/${encodeURIComponent(id)}/archive`, {
        method: "POST",
        body: JSON.stringify({ reason: reason || "Archived by super admin" }),
      });
    } catch {
      // 403 if not ADMIN_SUPER
    }
    revalidatePath(`/jobs/${encodeURIComponent(id)}`);
    redirect(`/jobs/${encodeURIComponent(id)}`);
  }

  async function doCancelAssigned() {
    "use server";
    try {
      await adminApiFetch(`/api/admin/v4/jobs/${encodeURIComponent(id)}/cancel-assigned`, { method: "POST" });
    } catch {
      // Error handled via revalidate
    }
    revalidatePath(`/jobs/${encodeURIComponent(id)}`);
    redirect(`/jobs/${encodeURIComponent(id)}`);
  }

  async function doPartialRefund(formData: FormData) {
    "use server";
    const confirmText = String(formData.get("confirmText") ?? "").trim();
    try {
      await adminApiFetch(`/api/admin/v4/jobs/${encodeURIComponent(id)}/partial-refund`, {
        method: "POST",
        body: JSON.stringify({ confirmText }),
      });
    } catch {
      // Error handled via revalidate
    }
    revalidatePath(`/jobs/${encodeURIComponent(id)}`);
    redirect(`/jobs/${encodeURIComponent(id)}`);
  }

  async function doContractorPayout(formData: FormData) {
    "use server";
    const confirmText = String(formData.get("confirmText") ?? "").trim();
    try {
      await adminApiFetch(`/api/admin/v4/jobs/${encodeURIComponent(id)}/contractor-payout`, {
        method: "POST",
        body: JSON.stringify({ confirmText }),
      });
    } catch {
      // Error handled via revalidate
    }
    revalidatePath(`/jobs/${encodeURIComponent(id)}`);
    redirect(`/jobs/${encodeURIComponent(id)}`);
  }

  async function doSuspendContractorForCancel(formData: FormData) {
    "use server";
    const confirmText = String(formData.get("confirmText") ?? "").trim();
    try {
      await adminApiFetch(`/api/admin/v4/jobs/${encodeURIComponent(id)}/suspend-contractor`, {
        method: "POST",
        body: JSON.stringify({ confirmText }),
      });
    } catch {
      // Error handled via revalidate
    }
    revalidatePath(`/jobs/${encodeURIComponent(id)}`);
    redirect(`/jobs/${encodeURIComponent(id)}`);
  }

  async function doSuperDelete(formData: FormData) {
    "use server";
    const confirm = String(formData.get("confirm") ?? "").trim();
    if (confirm !== "DELETE JOB") return;
    try {
      await adminApiFetch(`/api/admin/v4/super/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      // 403 or 409 if blocked
    }
    redirect("/jobs");
  }

  async function doApproveCancellation() {
    "use server";
    try {
      await adminApiFetch(`/api/admin/v4/jobs/${encodeURIComponent(id)}/approve-cancellation`, {
        method: "POST",
      });
    } catch {
      // Error shown via redirect flash
    }
    revalidatePath(`/jobs/${encodeURIComponent(id)}`);
    redirect(`/jobs/${encodeURIComponent(id)}`);
  }

  async function doRefund() {
    "use server";
    try {
      await adminApiFetch(`/api/admin/v4/jobs/${encodeURIComponent(id)}/refund`, {
        method: "POST",
      });
    } catch {
      // Error shown via redirect flash
    }
    revalidatePath(`/jobs/${encodeURIComponent(id)}`);
    redirect(`/jobs/${encodeURIComponent(id)}`);
  }

  async function doSuperEdit(formData: FormData) {
    "use server";
    const title = String(formData.get("title") ?? "").trim();
    const scope = String(formData.get("scope") ?? "").trim();
    const country_code = String(formData.get("country_code") ?? "").trim().toUpperCase();
    const region_code = String(formData.get("region_code") ?? "").trim().toUpperCase();
    const trade_category = String(formData.get("trade_category") ?? "").trim();
    const address_full = String(formData.get("address_full") ?? "").trim();
    const city = String(formData.get("city") ?? "").trim();
    const postal_code = String(formData.get("postal_code") ?? "").trim();
    const latitudeRaw = formData.get("latitude");
    const longitudeRaw = formData.get("longitude");
    const latitude = latitudeRaw != null ? Number(latitudeRaw) : undefined;
    const longitude = longitudeRaw != null ? Number(longitudeRaw) : undefined;
    if (!title && !scope && !country_code && !region_code && !trade_category && !address_full && !city && !postal_code && latitude == null && longitude == null) return;
    const payload: Record<string, string | number> = {};
    if (title) payload.title = title;
    if (scope) payload.scope = scope;
    if (country_code) payload.country_code = country_code;
    if (region_code) payload.region_code = region_code;
    if (trade_category) payload.trade_category = trade_category;
    if (address_full) payload.address_full = address_full;
    if (city) payload.city = city;
    if (postal_code) payload.postal_code = postal_code;
    if (latitude != null && Number.isFinite(latitude)) payload.latitude = latitude;
    if (longitude != null && Number.isFinite(longitude)) payload.longitude = longitude;
    try {
      await adminApiFetch(`/api/admin/v4/super/jobs/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } catch {
      // 403 if not ADMIN_SUPER
    }
    revalidatePath(`/jobs/${encodeURIComponent(id)}`);
    redirect(`/jobs/${encodeURIComponent(id)}`);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950, letterSpacing: 0.2 }}>Job Detail</h1>
          <div style={{ marginTop: 6 }}>
            <a href="/jobs" style={{ color: "rgba(191,219,254,0.95)", textDecoration: "none", fontWeight: 900 }}>
              ← Back
            </a>
          </div>
        </div>
        <div style={{ color: "rgba(226,232,240,0.72)", fontSize: 12 }}>
          ID: <code>{job.id}</code>
        </div>
      </div>

      <div style={{ marginTop: 12, maxWidth: 560 }}>
        <JobStatusEditor
          currentStatus={job.statusRaw}
          statusOptions={statusOptions}
          action={updateStatusAction}
          flash={flash}
        />
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        <Card title="Job Summary">
          {kv("Title", job.title)}
          {kv("Description", <span style={{ whiteSpace: "pre-wrap", lineHeight: "20px" }}>{job.description || "—"}</span>)}
          {kv("Trade", job.tradeCategory || "—")}
          {kv("Status (display)", displayStatus)}
          {kv("Status (raw)", job.statusRaw)}
          {kv("Routing", job.routingStatus || "—")}
          {kv("Mock", job.isMock ? "true" : "false")}
          {kv("Source", job.jobSource || "—")}
          {kv("Archived", job.archived ? "true" : "false")}
          {kv("Created", fmt(job.createdAt))}
          {kv("Updated", fmt(job.updatedAt))}
        </Card>

        <Card title="Address + Coordinates">
          {kv("Country", job.country || "—")}
          {kv("Region", job.regionCode || "—")}
          {kv("City", job.city || "—")}
          {kv("Postal", job.postalCode || "—")}
          {kv("Address", job.addressFull || "—")}
          {kv("Latitude", job.lat ?? "—")}
          {kv("Longitude", job.lng ?? "—")}
          <div style={{ marginTop: 10, borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
              Location Integrity
            </div>
            {((): React.ReactNode => {
              const checks = [
                { label: "Address", ok: Boolean(job.addressFull) },
                { label: "City", ok: Boolean(job.city) },
                { label: "Postal Code", ok: Boolean(job.postalCode) },
                { label: "Coordinates", ok: job.lat != null && job.lng != null },
              ];
              const allOk = checks.every((c) => c.ok);
              return (
                <div>
                  {checks.map((c) => (
                    <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 2 }}>
                      <span style={{ color: c.ok ? "#16a34a" : "#dc2626", fontWeight: 700 }}>{c.ok ? "✓" : "⚠"}</span>
                      <span style={{ color: c.ok ? "#15803d" : "#b91c1c" }}>{c.label}</span>
                    </div>
                  ))}
                  {!allOk && (
                    <div style={{ marginTop: 6, padding: "4px 8px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 4, fontSize: 12, color: "#b91c1c" }}>
                      ⚠ Location data incomplete — run repair-job-locations script to backfill
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <Card title="Parties">
          {kv("Job Poster", <PartyLink party={job.jobPoster} />)}
          {kv("Router", <PartyLink party={job.router} />)}
          {kv("Contractor", <PartyLink party={job.contractor} />)}
        </Card>

        <Card title="Money (Read-only)">
          {kv("Amount", money(job.amountCents))}
          {kv("Payment indicator", job.paymentState.label)}
          {kv("Payment status", job.paymentStatus || "—")}
          {kv("Payout status", job.payoutStatus || "—")}
          <div style={{ marginTop: 8, color: "rgba(226,232,240,0.68)", fontSize: 12 }}>
            Financial actions are intentionally disabled in this phase.
          </div>
        </Card>

        <Card title="P&M / Receipts / Messages">
          {kv("P&M requests", String(job ? data.related.pmRequests.count : 0))}
          {kv("P&M latest", fmt(data.related.pmRequests.latest))}
          {kv("Receipts", String(data.related.receipts.count))}
          {kv("Receipts latest", fmt(data.related.receipts.latest))}
          {kv("Message threads", String(data.related.messages.threadCount))}
          {kv("Message count", String(data.related.messages.messageCount))}
          <div style={{ marginTop: 8, color: "rgba(226,232,240,0.68)", fontSize: 12 }}>
            Full messaging/PM drill-down views are coming soon.
          </div>
        </Card>
      </div>

      <AdminRoutingAccordion
        jobId={job.id}
        jobStatus={job.statusRaw}
        existingRouterId={job.router?.id ?? null}
        adminRoutedById={job.adminRoutedById ?? null}
      />

      <div style={{ marginTop: 12 }}>
        <Card title="Escrow Financial Summary (Read-only)">
          {kv("Subtotal", money(job.financialSummary.appraisalSubtotalCents))}
          {kv("Regional fee", money(job.financialSummary.regionalFeeCents))}
          {kv("Tax rate", `${(job.financialSummary.taxRateBps / 100).toFixed(2)}%`)}
          {kv("Tax amount", money(job.financialSummary.taxAmountCents))}
          {kv("Total", money(job.financialSummary.totalAmountCents))}
          {kv("Country / Province", `${job.financialSummary.country || "—"} / ${job.financialSummary.province || "—"}`)}
          {kv("PI id", job.financialSummary.stripePaymentIntentId ?? "—")}
          {kv("PI status", job.financialSummary.stripePaymentIntentStatus ?? "—")}
          {kv("Paid at", fmt(job.financialSummary.stripePaidAt))}
          {kv("Refunded at", fmt(job.financialSummary.stripeRefundedAt))}
          {kv("Canceled at", fmt(job.financialSummary.stripeCanceledAt))}
          <div style={{ marginTop: 10 }}>
            <div style={{ color: "rgba(226,232,240,0.65)", fontSize: 12, fontWeight: 800 }}>Ledger allocations</div>
            {job.financialSummary.ledgerByType.length === 0 ? (
              <div style={{ marginTop: 6, color: "rgba(226,232,240,0.68)", fontSize: 12 }}>No ledger entries</div>
            ) : (
              <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                {job.financialSummary.ledgerByType.map((entry) => (
                  <div key={entry.type} style={{ fontSize: 12, color: "rgba(226,232,240,0.90)" }}>
                    <code>{entry.type}</code>: count {entry.count} · credits {money(entry.creditsCents)} · debits {money(entry.debitsCents)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 12 }}>
        <Card title="Timeline / Events">
          {data.timeline.length === 0 ? (
            <div style={{ color: "rgba(226,232,240,0.68)", fontSize: 13 }}>Not available yet</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {data.timeline.map((item, index) => (
                <div
                  key={`${item.at}-${item.type}-${index}`}
                  style={{
                    border: "1px solid rgba(148,163,184,0.12)",
                    borderRadius: 12,
                    padding: 10,
                    background: "rgba(2,6,23,0.22)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13, fontWeight: 900 }}>{item.label}</div>
                    <div style={{ color: "rgba(226,232,240,0.65)", fontSize: 12 }}>{fmt(item.at)}</div>
                  </div>
                  <div style={{ marginTop: 4, color: "rgba(226,232,240,0.68)", fontSize: 12 }}>
                    <code>{item.type}</code> · source: {item.source}
                    {item.actor ? ` · actor: ${item.actor}` : ""}
                  </div>
                  {item.detail ? <div style={{ marginTop: 6, fontSize: 12 }}>{item.detail}</div> : null}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 12 }}>
        {((): React.ReactNode => {
          const cr = data.cancelRequest ?? null;
          const crStatus = String(cr?.status ?? "").toLowerCase();
          const isPending = crStatus === "pending";
          const isApproved = crStatus === "approved";
          const isRefunded = crStatus === "refunded";
          const canRefund = isApproved && (job.paymentStatus === "FUNDS_SECURED" || job.paymentStatus === "FUNDED");

          const cardBorder = cr
            ? "1px solid rgba(251,146,60,0.4)"
            : "1px solid rgba(148,163,184,0.14)";
          const cardBg = cr
            ? "rgba(124,45,18,0.18)"
            : "rgba(2,6,23,0.22)";

          return (
            <div style={{ border: cardBorder, borderRadius: 16, padding: 14, background: cardBg }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ fontWeight: 950, color: "rgba(226,232,240,0.95)" }}>Cancellation Request</div>
                {cr && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 900,
                      letterSpacing: 0.5,
                      padding: "3px 8px",
                      borderRadius: 8,
                      background: isRefunded
                        ? "rgba(34,197,94,0.18)"
                        : isApproved
                          ? "rgba(59,130,246,0.18)"
                          : "rgba(251,146,60,0.22)",
                      color: isRefunded
                        ? "rgba(134,239,172,0.95)"
                        : isApproved
                          ? "rgba(147,197,253,0.95)"
                          : "rgba(253,186,116,0.95)",
                    }}
                  >
                    {crStatus.toUpperCase()}
                  </span>
                )}
              </div>
              {!cr ? (
                <div style={{ color: "rgba(226,232,240,0.50)", fontSize: 13 }}>No cancellation request on file.</div>
              ) : (
                <>
                  {kv("Requested By", cr.requestedByRole)}
                  {kv("Reason", cr.reason)}
                  {kv("Requested At", fmt(cr.requestedAt))}
                  {kv("Penalty Window", cr.withinPenaltyWindow ? "Yes" : "No")}
                  {cr.supportTicketId && kv("Support Ticket ID", <code style={{ fontSize: 11 }}>{cr.supportTicketId}</code>)}
                  <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                    {!isRefunded && (
                      <form action={doApproveCancellation}>
                        <button
                          type="submit"
                          disabled={!isPending}
                          style={{
                            background: isPending ? "rgba(59,130,246,0.18)" : "rgba(71,85,105,0.18)",
                            border: isPending ? "1px solid rgba(59,130,246,0.4)" : "1px solid rgba(71,85,105,0.3)",
                            color: isPending ? "rgba(147,197,253,0.95)" : "rgba(148,163,184,0.4)",
                            borderRadius: 12,
                            padding: "9px 14px",
                            fontSize: 13,
                            fontWeight: 900,
                            cursor: isPending ? "pointer" : "not-allowed",
                          }}
                        >
                          Approve Cancellation
                        </button>
                      </form>
                    )}
                    {!isRefunded && (
                      <form action={doRefund}>
                        <button
                          type="submit"
                          disabled={!canRefund}
                          style={{
                            background: canRefund ? "rgba(248,113,113,0.18)" : "rgba(71,85,105,0.18)",
                            border: canRefund ? "1px solid rgba(248,113,113,0.4)" : "1px solid rgba(71,85,105,0.3)",
                            color: canRefund ? "rgba(254,202,202,0.95)" : "rgba(148,163,184,0.4)",
                            borderRadius: 12,
                            padding: "9px 14px",
                            fontSize: 13,
                            fontWeight: 900,
                            cursor: canRefund ? "pointer" : "not-allowed",
                          }}
                        >
                          Issue Refund
                        </button>
                      </form>
                    )}
                    {isRefunded && (
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 900,
                          color: "rgba(134,239,172,0.95)",
                          padding: "9px 14px",
                          border: "1px solid rgba(34,197,94,0.3)",
                          borderRadius: 12,
                          background: "rgba(34,197,94,0.12)",
                        }}
                      >
                        Refund Issued
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })()}
      </div>

      {/* Assigned Job Cancellation Card — shown when an assigned job has a cancel request */}
      {data.cancelRequest && (data.cancelRequest.requestedByRole === "JOB_POSTER" || data.cancelRequest.requestedByRole === "CONTRACTOR") && (job.statusRaw === "ASSIGNED_CANCEL_PENDING" || job.statusRaw === "CANCELLED") && (() => {
        const cr = data.cancelRequest!;
        const jobStatus = String(job.statusRaw ?? "");
        const crStatus = String(cr.status ?? "").toLowerCase();
        const isAwaitingCancel = jobStatus === "ASSIGNED_CANCEL_PENDING";
        const isCancelled = jobStatus === "CANCELLED" || crStatus === "approved" || crStatus === "refunded";

        const posterInWindow = cr.requestedByRole === "JOB_POSTER" && cr.withinPenaltyWindow;
        const contractorInWindow = cr.requestedByRole === "CONTRACTOR" && cr.withinPenaltyWindow;

        const refundDone = Boolean(cr.refundProcessedAt);
        const payoutDone = Boolean(cr.payoutProcessedAt);
        const suspensionDone = Boolean(cr.suspensionProcessedAt);

        // Determine which refund label to show
        const refundLabel = posterInWindow ? "75% Refund" : "100% Refund";
        const refundActive = isCancelled && !refundDone;

        // Payout applies only for poster+inWindow
        const payoutActive = isCancelled && posterInWindow && !payoutDone;
        const showPayout = posterInWindow;

        // Suspension applies only for contractor+inWindow
        const suspendActive = isCancelled && contractorInWindow && !suspensionDone;
        const showSuspend = contractorInWindow;

        const btnBase: React.CSSProperties = {
          borderRadius: 12,
          padding: "9px 14px",
          fontSize: 13,
          fontWeight: 900,
          cursor: "pointer",
          border: "none",
        };
        const activeBtn = (color: string): React.CSSProperties => ({
          ...btnBase,
          background: `rgba(${color},0.18)`,
          border: `1px solid rgba(${color},0.4)`,
          color: `rgba(${color},0.95)`,
          cursor: "pointer",
        });
        const disabledBtn: React.CSSProperties = {
          ...btnBase,
          background: "rgba(71,85,105,0.18)",
          border: "1px solid rgba(71,85,105,0.3)",
          color: "rgba(148,163,184,0.4)",
          cursor: "not-allowed",
        };
        const doneTag = (ts: string | null | undefined) => ts ? (
          <span style={{ fontSize: 11, color: "rgba(134,239,172,0.9)", fontWeight: 700 }}>
            Done {fmt(ts)}
          </span>
        ) : null;

        return (
          <div style={{ marginTop: 12, border: "1px solid rgba(251,146,60,0.35)", borderRadius: 16, padding: 14, background: "rgba(120,53,15,0.18)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ fontWeight: 950, color: "rgba(226,232,240,0.95)" }}>Assigned Job Cancellation</div>
              <span style={{
                fontSize: 10, fontWeight: 900, letterSpacing: 0.5, padding: "3px 8px", borderRadius: 8,
                background: isAwaitingCancel ? "rgba(251,146,60,0.22)" : "rgba(59,130,246,0.18)",
                color: isAwaitingCancel ? "rgba(253,186,116,0.95)" : "rgba(147,197,253,0.95)",
              }}>
                {isAwaitingCancel ? "AWAITING ADMIN CANCEL" : crStatus.toUpperCase()}
              </span>
            </div>

            {kv("Cancelled By", cr.requestedByRole)}
            {kv("Within 8h Window", cr.withinPenaltyWindow ? "YES" : "NO")}
            {kv("Reason", cr.reason)}
            {kv("Requested At", fmt(cr.requestedAt))}
            {cr.supportTicketId && kv("Support Ticket", <code style={{ fontSize: 11 }}>{cr.supportTicketId}</code>)}

            <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 10 }}>
              {/* Step 1: Cancel Job */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <form action={doCancelAssigned}>
                  <button
                    type="submit"
                    disabled={!isAwaitingCancel}
                    style={isAwaitingCancel ? activeBtn("251,146,60") : disabledBtn}
                  >
                    Cancel Job
                  </button>
                </form>
                {!isAwaitingCancel && isCancelled && (
                  <span style={{ fontSize: 11, color: "rgba(134,239,172,0.9)", fontWeight: 700 }}>Done</span>
                )}
              </div>

              {/* Step 2a: Refund */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {refundDone ? (
                  <div>
                    <button type="button" disabled style={disabledBtn}>{refundLabel}</button>
                    {doneTag(cr.refundProcessedAt)}
                  </div>
                ) : (
                  <form action={doPartialRefund} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <input
                      name="confirmText"
                      placeholder='Type "REFUND" to confirm'
                      style={{ background: "rgba(15,23,42,0.7)", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 8, padding: "6px 10px", color: "rgba(226,232,240,0.9)", fontSize: 12, width: 160 }}
                    />
                    <button type="submit" disabled={!refundActive} style={refundActive ? activeBtn("248,113,113") : disabledBtn}>
                      {refundLabel}
                    </button>
                  </form>
                )}
              </div>

              {/* Step 2b: Contractor Payout (poster+inWindow only) */}
              {showPayout && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {payoutDone ? (
                    <div>
                      <button type="button" disabled style={disabledBtn}>25% Contractor Payout</button>
                      {doneTag(cr.payoutProcessedAt)}
                    </div>
                  ) : (
                    <form action={doContractorPayout} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <input
                        name="confirmText"
                        placeholder='Type "PAYOUT" to confirm'
                        style={{ background: "rgba(15,23,42,0.7)", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 8, padding: "6px 10px", color: "rgba(226,232,240,0.9)", fontSize: 12, width: 160 }}
                      />
                      <button type="submit" disabled={!payoutActive} style={payoutActive ? activeBtn("250,204,21") : disabledBtn}>
                        25% Contractor Payout
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* Step 2c: Suspend Contractor (contractor+inWindow only) */}
              {showSuspend && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {suspensionDone ? (
                    <div>
                      <button type="button" disabled style={disabledBtn}>Suspend Contractor</button>
                      {doneTag(cr.suspensionProcessedAt)}
                    </div>
                  ) : (
                    <form action={doSuspendContractorForCancel} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <input
                        name="confirmText"
                        placeholder='Type "SUSPEND" to confirm'
                        style={{ background: "rgba(15,23,42,0.7)", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 8, padding: "6px 10px", color: "rgba(226,232,240,0.9)", fontSize: 12, width: 160 }}
                      />
                      <button type="submit" disabled={!suspendActive} style={suspendActive ? activeBtn("167,139,250") : disabledBtn}>
                        Suspend Contractor (7d)
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>

            {/* Policy reminder */}
            <div style={{ marginTop: 12, fontSize: 11, color: "rgba(148,163,184,0.6)", lineHeight: "18px" }}>
              Policy: {posterInWindow
                ? "Poster cancelled in window → 75% refund to poster + 25% payout to contractor."
                : contractorInWindow
                  ? "Contractor cancelled in window → 100% refund to poster + 7-day contractor suspension."
                  : "Outside penalty window → 100% refund, no payout, no suspension."}
            </div>
          </div>
        );
      })()}

      <div style={{ marginTop: 12 }}>
        <Card title="">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ fontWeight: 950, color: "rgba(226,232,240,0.95)" }}>Super Admin Controls</div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: 0.5,
                padding: "4px 8px",
                borderRadius: 8,
                background: "rgba(251,191,36,0.2)",
                color: "rgba(253,224,71,0.95)",
              }}
            >
              SUPER ADMIN
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 12, color: "rgba(226,232,240,0.78)", marginBottom: 6 }}>Edit</div>
              <JobEditForm
                action={doSuperEdit}
                defaultTitle={job.title}
                defaultScope={job.scope}
                defaultCountryCode={job.country ?? "CA"}
                defaultRegionCode={job.regionCode ?? ""}
                defaultTradeCategory={job.tradeCategory}
                defaultAddress={job.addressFull ?? undefined}
                defaultCity={job.city ?? undefined}
                defaultPostalCode={job.postalCode ?? undefined}
                jobId={job.id}
              />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 12, color: "rgba(226,232,240,0.78)", marginBottom: 6 }}>Suspend</div>
              <form action={doSuperSuspend} style={{ display: "grid", gap: 6 }}>
                <select name="duration" style={{ ...inputStyle, width: "100%" }}>
                  <option value="1w">1 week</option>
                  <option value="1m">1 month</option>
                  <option value="3m">3 months</option>
                  <option value="6m">6 months</option>
                </select>
                <textarea name="reason" placeholder="Reason (required)" rows={2} style={inputStyle} />
                <button type="submit" style={dangerButtonStyle}>
                  Suspend
                </button>
              </form>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 12, color: "rgba(226,232,240,0.78)", marginBottom: 6 }}>Archive</div>
              <form action={doSuperArchive} style={{ display: "grid", gap: 6 }}>
                <textarea name="reason" placeholder="Reason (optional)" rows={2} style={inputStyle} />
                <button type="submit" style={dangerButtonStyle}>
                  Archive
                </button>
              </form>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 12, color: "rgba(254,202,202,0.95)", marginBottom: 6 }}>Delete</div>
              <form action={doSuperDelete} style={{ display: "grid", gap: 6 }}>
                <input name="confirm" placeholder='Type "DELETE JOB" to confirm' style={inputStyle} />
                <button type="submit" style={dangerButtonStyle}>
                  Delete Job
                </button>
              </form>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
