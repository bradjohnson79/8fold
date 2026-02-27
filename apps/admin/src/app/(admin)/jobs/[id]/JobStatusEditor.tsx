"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  jobId: string;
  currentStatus: string;
  statusOptions: string[];
};

function toErrorMessage(json: any, fallback: string): string {
  const nested = json?.error;
  if (typeof nested === "string" && nested.trim()) return nested.trim();
  if (nested && typeof nested === "object") {
    const msg = String(nested.message ?? "").trim();
    if (msg) return msg;
  }
  const msg = String(json?.message ?? "").trim();
  if (msg) return msg;
  return fallback;
}

export default function JobStatusEditor({ jobId, currentStatus, statusOptions }: Props) {
  const router = useRouter();
  const [nextStatus, setNextStatus] = useState(currentStatus);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const normalizedOptions = useMemo(() => {
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
  }, [currentStatus, statusOptions]);

  const unchanged = nextStatus === currentStatus;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || unchanged) return;

    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const resp = await fetch(`/api/admin/v4/jobs/${encodeURIComponent(jobId)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            status: nextStatus,
            note: note.trim() || undefined,
          }),
        });
        const payload = await resp.json().catch(() => null);
        if (!resp.ok) {
          throw new Error(toErrorMessage(payload, `Failed to update status (${resp.status})`));
        }

        setSuccess(`Status updated: ${currentStatus} -> ${nextStatus}`);
        setNote("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update status");
      }
    });
  }

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
      </div>

      <form onSubmit={onSubmit} style={{ marginTop: 10, display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ color: "rgba(226,232,240,0.74)", fontSize: 12, fontWeight: 900 }}>Set Status</span>
          <select
            value={nextStatus}
            onChange={(e) => setNextStatus(e.target.value)}
            disabled={pending}
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
                {status}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ color: "rgba(226,232,240,0.74)", fontSize: 12, fontWeight: 900 }}>Admin Note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={pending}
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
          disabled={pending || unchanged}
          style={{
            border: "1px solid rgba(56,189,248,0.35)",
            background: "rgba(56,189,248,0.18)",
            color: "rgba(186,230,253,0.96)",
            borderRadius: 12,
            padding: "9px 12px",
            fontWeight: 900,
            cursor: pending || unchanged ? "not-allowed" : "pointer",
            opacity: pending || unchanged ? 0.6 : 1,
          }}
        >
          {pending ? "Saving..." : unchanged ? "No changes" : "Update status"}
        </button>

        {error ? <div style={{ color: "rgba(254,202,202,0.95)", fontSize: 12, fontWeight: 900 }}>{error}</div> : null}
        {success ? <div style={{ color: "rgba(134,239,172,0.95)", fontSize: 12, fontWeight: 900 }}>{success}</div> : null}
      </form>
    </div>
  );
}
