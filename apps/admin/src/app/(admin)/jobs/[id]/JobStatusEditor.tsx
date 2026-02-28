type Props = {
  currentStatus: string;
  statusOptions: string[];
  action: (formData: FormData) => void | Promise<void>;
  flash:
    | {
        tone: "success" | "error";
        message: string;
      }
    | null;
};

function normalizeStatusOptions(statusOptions: string[], currentStatus: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const raw of statusOptions) {
    const value = String(raw ?? "").trim().toUpperCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    items.push(value);
  }
  if (!seen.has(currentStatus)) items.unshift(currentStatus);
  return items;
}

function statusLabel(status: string): string {
  const value = String(status ?? "").trim().toUpperCase();
  if (value === "OPEN_FOR_ROUTING") return "CUSTOMER_APPROVED_AWAITING_ROUTER";
  return value;
}

export default function JobStatusEditor({ currentStatus, statusOptions, action, flash }: Props) {
  const normalizedOptions = normalizeStatusOptions(statusOptions, currentStatus);
  const currentLabel = statusLabel(currentStatus);

  return (
    <div
      style={{
        border: "1px solid rgba(148,163,184,0.14)",
        borderRadius: 16,
        padding: 14,
        background: "rgba(2,6,23,0.35)",
      }}
    >
      <div style={{ fontWeight: 950, color: "rgba(226,232,240,0.95)" }}>Manual Status Override</div>
      <div style={{ marginTop: 6, fontSize: 12, color: "rgba(226,232,240,0.70)" }}>
        Current: <code>{currentStatus}</code>
        {currentLabel !== currentStatus ? (
          <span>
            {" "}
            · Label: <code>{currentLabel}</code>
          </span>
        ) : null}
      </div>

      <form action={action} style={{ marginTop: 10, display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ color: "rgba(226,232,240,0.74)", fontSize: 12, fontWeight: 900 }}>Set Status</span>
          <select
            name="status"
            defaultValue={currentStatus}
            style={{
              background: "rgba(2,6,23,0.35)",
              border: "1px solid rgba(148,163,184,0.14)",
              color: "rgba(226,232,240,0.92)",
              borderRadius: 12,
              padding: "9px 10px",
              fontSize: 13,
            }}
          >
            {normalizedOptions.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status) === status ? status : `${statusLabel(status)} (${status})`}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ color: "rgba(226,232,240,0.74)", fontSize: 12, fontWeight: 900 }}>Admin Note (optional)</span>
          <textarea
            name="note"
            maxLength={500}
            rows={2}
            placeholder="Reason for status override"
            style={{
              background: "rgba(2,6,23,0.35)",
              border: "1px solid rgba(148,163,184,0.14)",
              color: "rgba(226,232,240,0.92)",
              borderRadius: 12,
              padding: "9px 10px",
              fontSize: 13,
              resize: "vertical",
            }}
          />
        </label>

        <button
          type="submit"
          style={{
            border: "1px solid rgba(56,189,248,0.35)",
            background: "rgba(56,189,248,0.18)",
            color: "rgba(186,230,253,0.96)",
            borderRadius: 12,
            padding: "9px 12px",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          Update status
        </button>

        {flash ? (
          <div
            style={{
              color: flash.tone === "success" ? "rgba(134,239,172,0.95)" : "rgba(254,202,202,0.95)",
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            {flash.message}
          </div>
        ) : null}
      </form>
    </div>
  );
}
