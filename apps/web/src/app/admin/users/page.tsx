"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/admin/lib/api";
import { PageHeader, Card } from "@/admin/ui/primitives";
import { AdminColors } from "@/admin/ui/theme";
import { formatDateTime } from "@/admin/ui/format";
import { DataTable, type Column } from "@/admin/ui/DataTable";

type RoleFilter = "JOB_POSTER" | "ROUTER" | "CONTRACTOR" | "ADMIN";
type RangeFilter = "1D" | "7D" | "30D" | "90D" | "ALL";

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone?: string | null;
  role: string;
  status: string;
  suspendedUntil?: string | null;
  suspensionReason?: string | null;
  archivedAt?: string | null;
  archivedReason?: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  createdAt: string;
};

const ROLE_LABELS: Record<RoleFilter, string> = {
  JOB_POSTER: "Job Poster",
  ROUTER: "Router",
  CONTRACTOR: "Contractor",
  ADMIN: "Admin",
};

const RANGE_LABELS: Record<RangeFilter, string> = {
  "1D": "Last 1 Day",
  "7D": "Last 7 Days",
  "30D": "Last 30 Days",
  "90D": "Last 90 Days",
  ALL: "All Time",
};

const btnBase = {
  padding: "4px 8px",
  borderRadius: 6,
  border: `1px solid ${AdminColors.border}`,
  background: AdminColors.card,
  color: AdminColors.text,
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 600,
} as const;

function UserRowActions(props: {
  user: UserRow;
  role: RoleFilter;
  onEditClick: (user: UserRow) => void;
  onSuspendClick: (user: UserRow) => void;
  onArchiveClick: (user: UserRow) => void;
  onDeleteClick: (user: UserRow) => void;
}) {
  const { user, role, onEditClick, onSuspendClick, onArchiveClick, onDeleteClick } = props;
  const status = (user?.status ?? "ACTIVE").toUpperCase();
  const isAdmin = role === "ADMIN";

  if (isAdmin) return <span style={{ color: AdminColors.muted, fontSize: 11 }}>—</span>;

  const showEdit = status === "ACTIVE" || status === "SUSPENDED";
  const showSuspend = status === "ACTIVE";
  const showArchive = status === "ACTIVE" || status === "SUSPENDED";
  const showDelete = true;

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
      {showEdit && (
        <button type="button" onClick={() => onEditClick(user)} style={btnBase}>
          Edit
        </button>
      )}
      {showSuspend && (
        <button type="button" onClick={() => onSuspendClick(user)} style={btnBase}>
          Suspend
        </button>
      )}
      {showArchive && (
        <button type="button" onClick={() => onArchiveClick(user)} style={btnBase}>
          Archive
        </button>
      )}
      {showDelete && (
        <button
          type="button"
          onClick={() => onDeleteClick(user)}
          style={{ ...btnBase, borderColor: AdminColors.danger, color: AdminColors.danger }}
        >
          Delete
        </button>
      )}
    </div>
  );
}

// NOTE: For Phase 6, keep modal logic minimal; this page is primarily here to preserve structure.
export default function UsersPage() {
  const params = useSearchParams();
  const role = (params.get("role") ?? "JOB_POSTER") as RoleFilter;
  const range = (params.get("range") ?? "30D") as RangeFilter;
  const q = params.get("q") ?? "";

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [rows, setRows] = React.useState<UserRow[]>([]);

  const [editTarget, setEditTarget] = React.useState<UserRow | null>(null);
  const [suspendTarget, setSuspendTarget] = React.useState<UserRow | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<UserRow | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      qs.set("role", role);
      qs.set("range", range);
      if (q.trim()) qs.set("q", q.trim());
      const data = await apiFetch<{ ok: true; users: UserRow[] }>(`/api/admin/users?${qs.toString()}`);
      setRows(Array.isArray((data as any).users) ? ((data as any).users as UserRow[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, range, q]);

  const cols: Array<Column<UserRow>> = [
    {
      key: "name",
      header: "Name",
      render: (u) => (
        <div>
          <div style={{ fontWeight: 900 }}>{u.name ?? "—"}</div>
          <div style={{ fontSize: 12, color: AdminColors.muted }}>{u.email ?? "—"}</div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (u) => <span style={{ fontWeight: 800 }}>{u.role}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (u) => <span style={{ color: AdminColors.muted }}>{u.status}</span>,
    },
    {
      key: "location",
      header: "Location",
      render: (u) => (
        <span style={{ color: AdminColors.muted }}>
          {[u.city, u.state, u.country].filter(Boolean).join(", ") || "—"}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "Created",
      render: (u) => <span style={{ color: AdminColors.muted }}>{formatDateTime(u.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (u) => (
        <UserRowActions
          user={u}
          role={role}
          onEditClick={(x) => setEditTarget(x)}
          onSuspendClick={(x) => setSuspendTarget(x)}
          onArchiveClick={(x) => setArchiveTarget(x)}
          onDeleteClick={() => alert("Delete not migrated yet")}
        />
      ),
    },
  ];

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <PageHeader
        eyebrow="Users"
        title="User Accounts"
        subtitle="Search and manage user accounts."
      />

      {error ? (
        <Card style={{ marginBottom: 14, borderColor: AdminColors.danger }}>
          <div style={{ color: AdminColors.danger, fontWeight: 900 }}>{error}</div>
        </Card>
      ) : null}

      <DataTable columns={cols} rows={rows} keyForRow={(u) => u.id} emptyText={loading ? "Loading…" : "No users."} />

      {/* Placeholders so the page compiles while we migrate the deeper admin actions. */}
      {editTarget || suspendTarget || archiveTarget ? (
        <div style={{ marginTop: 12, color: AdminColors.muted, fontSize: 12 }}>
          Modals/actions not fully migrated yet in Phase 6.
        </div>
      ) : null}
    </main>
  );
}

