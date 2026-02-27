import { adminApiFetch } from "@/server/adminApiV4";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import JobStatusEditor from "./JobStatusEditor";

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
  jobPoster: Party | null;
  router: Party | null;
  contractor: Party | null;
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

type DetailResp = {
  job: JobDetail;
  timeline: TimelineEvent[];
  related: Related;
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
    </div>
  );
}
