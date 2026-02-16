import { redirect } from "next/navigation";
import { adminApiFetch } from "@/server/adminApi";

type UserDetail = {
  id: string;
  authUserId: string | null;
  email: string | null;
  phone: string | null;
  name: string | null;
  role: string;
  status: string;
  suspendedUntil: string | null;
  suspensionReason: string | null;
  archivedAt: string | null;
  archivedReason: string | null;
  country: string | null;
  createdAt: string;
  updatedAt: string;
};

type DetailResp = {
  user: UserDetail;
  jobPoster: any | null;
  router: any | null;
  contractorAccount: any | null;
};

type NotesResp = { notes: Array<{ id: string; createdAt: string; actorUserId: string | null; note: string }> };

async function doSuspend(userId: string, formData: FormData) {
  "use server";
  const months = Number(formData.get("months") ?? 1);
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return;
  await adminApiFetch(`/api/admin/users/${encodeURIComponent(userId)}/suspend`, {
    method: "POST",
    body: JSON.stringify({ months, reason }),
  }).catch(() => null);
  redirect(`/users/${encodeURIComponent(userId)}`);
}

async function doUnsuspend(userId: string) {
  "use server";
  await adminApiFetch(`/api/admin/users/${encodeURIComponent(userId)}/unsuspend`, { method: "POST" }).catch(() => null);
  redirect(`/users/${encodeURIComponent(userId)}`);
}

async function doArchive(userId: string, formData: FormData) {
  "use server";
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return;
  await adminApiFetch(`/api/admin/users/${encodeURIComponent(userId)}/archive`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  }).catch(() => null);
  redirect(`/users/${encodeURIComponent(userId)}`);
}

async function doRestore(userId: string) {
  "use server";
  await adminApiFetch(`/api/admin/users/${encodeURIComponent(userId)}/restore`, { method: "POST" }).catch(() => null);
  redirect(`/users/${encodeURIComponent(userId)}`);
}

async function doAddNote(userId: string, formData: FormData) {
  "use server";
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return;
  await adminApiFetch(`/api/admin/users/${encodeURIComponent(userId)}/notes`, {
    method: "POST",
    body: JSON.stringify({ note }),
  }).catch(() => null);
  redirect(`/users/${encodeURIComponent(userId)}`);
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
    <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10, padding: "6px 0" }}>
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

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let detail: DetailResp | null = null;
  let notes: NotesResp | null = null;
  let err: string | null = null;

  try {
    detail = await adminApiFetch<DetailResp>(`/api/admin/users/${encodeURIComponent(id)}`);
    notes = await adminApiFetch<NotesResp>(`/api/admin/users/${encodeURIComponent(id)}/notes`).catch(() => ({ notes: [] }));
  } catch (e) {
    err = e instanceof Error ? e.message : "Failed to load user";
  }

  if (err) {
    return (
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>User</h1>
        <p style={{ marginTop: 10, color: "rgba(254,202,202,0.95)" }}>{err}</p>
        <a href="/users" style={{ color: "rgba(191,219,254,0.95)", fontWeight: 900, textDecoration: "none" }}>
          ← Back to Users
        </a>
      </div>
    );
  }

  const u = detail!.user;
  const contractor = detail!.contractorAccount;
  const router = detail!.router;
  const jobPoster = detail!.jobPoster;

  const isSuspended = u.status === "SUSPENDED";
  const isArchived = u.status === "ARCHIVED";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950, letterSpacing: 0.2 }}>User</h1>
          <div style={{ marginTop: 6, color: "rgba(226,232,240,0.72)" }}>
            <a href="/users" style={{ color: "rgba(191,219,254,0.95)", textDecoration: "none", fontWeight: 900 }}>
              ← Back
            </a>
          </div>
        </div>
        <div style={{ color: "rgba(226,232,240,0.72)", fontSize: 12 }}>
          ID: <code>{u.id}</code>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        <Card title="Core info">
          {kv("Name", u.name ?? "—")}
          {kv("Email", u.email ?? "—")}
          {kv("Role", u.role)}
          {kv("Status", u.status)}
          {kv("Country", u.country ?? "—")}
          {kv("Created", u.createdAt?.slice(0, 19).replace("T", " ") ?? "—")}
          {kv("Updated", u.updatedAt?.slice(0, 19).replace("T", " ") ?? "—")}
          {kv("Suspended until", u.suspendedUntil ?? "—")}
          {kv("Suspension reason", u.suspensionReason ?? "—")}
          {kv("Archived at", u.archivedAt ?? "—")}
          {kv("Archived reason", u.archivedReason ?? "—")}
        </Card>

        <Card title="Enforcement controls">
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
            <div style={{ fontWeight: 900 }}>Suspend</div>
            {isSuspended ? (
              <div style={{ color: "rgba(226,232,240,0.72)", fontSize: 13 }}>
                User is currently suspended. Use “Unsuspend” to restore access.
              </div>
            ) : (
              <form action={doSuspend.bind(null, u.id)} style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, alignItems: "center" }}>
                  <label style={{ color: "rgba(226,232,240,0.72)", fontSize: 12, fontWeight: 800 }}>Months</label>
                  <select name="months" defaultValue="1" style={{ ...inputStyle, width: "100%" }}>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                    <option value="6">6</option>
                  </select>
                </div>
                <textarea name="reason" placeholder="Reason (required)" rows={3} style={inputStyle} />
                <button type="submit" style={dangerButtonStyle}>
                  Suspend
                </button>
              </form>
            )}
            {isSuspended ? (
              <form action={doUnsuspend.bind(null, u.id)}>
                <button type="submit" style={buttonStyle}>
                  Unsuspend
                </button>
              </form>
            ) : null}
          </div>

          <div style={{ height: 1, background: "rgba(148,163,184,0.12)", margin: "12px 0" }} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
            <div style={{ fontWeight: 900 }}>Dismiss</div>
            {isArchived ? (
              <div style={{ color: "rgba(226,232,240,0.72)", fontSize: 13 }}>
                User is dismissed (archived). Use “Restore” to re-activate.
              </div>
            ) : (
              <form action={doArchive.bind(null, u.id)} style={{ display: "grid", gap: 8 }}>
                <textarea name="reason" placeholder="Reason (required)" rows={3} style={inputStyle} />
                <button type="submit" style={dangerButtonStyle}>
                  Dismiss (Archive)
                </button>
              </form>
            )}
            {isArchived ? (
              <form action={doRestore.bind(null, u.id)}>
                <button type="submit" style={buttonStyle}>
                  Restore
                </button>
              </form>
            ) : null}
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <Card title="Contractor performance">
          {contractor ? (
            <>
              {kv("Wizard completed", String(Boolean(contractor.wizardCompleted)))}
              {kv("Waiver accepted", String(Boolean(contractor.waiverAccepted)))}
              {kv("Approved", String(Boolean(contractor.isApproved)))}
              {kv("Jobs completed", String(contractor.jobsCompleted ?? 0))}
              {kv("Rating", contractor.rating ?? "—")}
              {kv("Trade category", contractor.tradeCategory ?? "—")}
              {kv("Region", contractor.regionCode ?? "—")}
              {kv("City", contractor.city ?? "—")}
            </>
          ) : (
            <div style={{ color: "rgba(226,232,240,0.72)" }}>Not a contractor.</div>
          )}
        </Card>

        <Card title="Router stats">
          {router ? (
            <>
              {kv("Status", router.status ?? "—")}
              {kv("Senior router", String(Boolean(router.isSeniorRouter)))}
              {kv("Routes completed", String(router.routesCompleted ?? 0))}
              {kv("Routes failed", String(router.routesFailed ?? 0))}
              {kv("Daily route limit", String(router.dailyRouteLimit ?? 0))}
              {kv("Home region", router.homeRegionCode ?? "—")}
              {kv("Home city", router.homeCity ?? "—")}
            </>
          ) : (
            <div style={{ color: "rgba(226,232,240,0.72)" }}>Not a router.</div>
          )}
        </Card>

        <Card title="Job poster stats">
          {jobPoster ? (
            <>
              {kv("Active", String(Boolean(jobPoster.isActive)))}
              {kv("Default region", jobPoster.defaultRegion ?? "—")}
              {kv("Total jobs posted", String(jobPoster.totalJobsPosted ?? 0))}
              {kv("Last job posted", jobPoster.lastJobPostedAt ? String(jobPoster.lastJobPostedAt).slice(0, 19) : "—")}
            </>
          ) : (
            <div style={{ color: "rgba(226,232,240,0.72)" }}>Not a job poster.</div>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
        <Card title="Admin notes">
          <form action={doAddNote.bind(null, u.id)} style={{ display: "grid", gap: 8 }}>
            <textarea name="note" placeholder="Write an internal note (audit logged)..." rows={3} style={inputStyle} />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" style={buttonStyle}>
                Add note
              </button>
            </div>
          </form>

          <div style={{ marginTop: 12 }}>
            {(notes?.notes ?? []).length === 0 ? (
              <div style={{ color: "rgba(226,232,240,0.72)" }}>No notes.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {notes!.notes.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      border: "1px solid rgba(148,163,184,0.12)",
                      borderRadius: 14,
                      padding: 10,
                      background: "rgba(2,6,23,0.22)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ color: "rgba(226,232,240,0.78)", fontSize: 12, fontWeight: 900 }}>
                        {n.createdAt.slice(0, 19).replace("T", " ")}
                      </div>
                      <div style={{ color: "rgba(226,232,240,0.55)", fontSize: 12 }}>
                        actor: <code>{n.actorUserId ?? "—"}</code>
                      </div>
                    </div>
                    <div style={{ marginTop: 8, whiteSpace: "pre-wrap", lineHeight: "20px" }}>{n.note}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

