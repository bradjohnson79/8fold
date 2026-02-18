"use client";

import React, { useRef, useState } from "react";

type ServerAction = (formData: FormData) => void | Promise<void>;
type AdminTier = "ADMIN_VIEWER" | "ADMIN_OPERATOR" | "ADMIN_SUPER";

type Props = {
  jobId: string;
  jobStatus: string | null | undefined;
  payoutStatus: string | null | undefined;
  archived: boolean | null | undefined;
  adminTier: AdminTier;
  lastActors?: {
    forceApprove?: { whenIso: string | null; actorLabel: string | null };
    refund?: { whenIso: string | null; actorLabel: string | null };
    manualRelease?: { whenIso: string | null; actorLabel: string | null };
    archive?: { whenIso: string | null; actorLabel: string | null; reason: string | null };
  };
  act: ServerAction;
};

function pill(text: string, tone: "slate" | "amber" | "red" | "green") {
  const colors =
    tone === "green"
      ? { bg: "rgba(34,197,94,0.14)", border: "rgba(34,197,94,0.35)", fg: "rgba(134,239,172,0.95)" }
      : tone === "amber"
        ? { bg: "rgba(251,191,36,0.14)", border: "rgba(251,191,36,0.35)", fg: "rgba(253,230,138,0.95)" }
        : tone === "red"
          ? { bg: "rgba(248,113,113,0.14)", border: "rgba(248,113,113,0.35)", fg: "rgba(254,202,202,0.95)" }
          : { bg: "rgba(2,6,23,0.25)", border: "rgba(148,163,184,0.14)", fg: "rgba(226,232,240,0.85)" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "5px 9px",
        borderRadius: 999,
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        color: colors.fg,
        fontSize: 12,
        fontWeight: 950,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function Modal(props: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  danger?: boolean;
}) {
  if (!props.open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(2,6,23,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onCancel();
      }}
    >
      <div
        style={{
          width: "min(760px, 100%)",
          borderRadius: 16,
          border: "1px solid rgba(148,163,184,0.16)",
          background: "rgba(2,6,23,0.98)",
          boxShadow: "0 30px 90px rgba(0,0,0,0.40)",
          padding: 14,
        }}
      >
        <div style={{ fontWeight: 950, fontSize: 15, color: "rgba(226,232,240,0.95)" }}>{props.title}</div>
        <div style={{ marginTop: 10, color: "rgba(226,232,240,0.88)", fontSize: 13, lineHeight: "20px" }}>{props.children}</div>
        <div style={{ marginTop: 14, display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={props.onCancel}
            style={{
              borderRadius: 12,
              padding: "9px 12px",
              fontSize: 13,
              fontWeight: 950,
              border: "1px solid rgba(148,163,184,0.18)",
              background: "rgba(2,6,23,0.35)",
              color: "rgba(226,232,240,0.90)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            disabled={props.confirmDisabled}
            style={{
              borderRadius: 12,
              padding: "9px 12px",
              fontSize: 13,
              fontWeight: 950,
              border: `1px solid ${props.danger ? "rgba(248,113,113,0.35)" : "rgba(34,197,94,0.35)"}`,
              background: props.danger ? "rgba(248,113,113,0.16)" : "rgba(34,197,94,0.16)",
              color: props.danger ? "rgba(254,202,202,0.95)" : "rgba(134,239,172,0.95)",
              cursor: props.confirmDisabled ? "not-allowed" : "pointer",
              opacity: props.confirmDisabled ? 0.55 : 1,
            }}
          >
            {props.confirmLabel}
          </button>
        </div>
      </div>
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

function previewBox(value: unknown) {
  return (
    <div
      style={{
        border: "1px solid rgba(148,163,184,0.14)",
        borderRadius: 12,
        padding: 10,
        background: "rgba(2,6,23,0.35)",
      }}
    >
      <div style={{ fontWeight: 950, marginBottom: 6 }}>Preview</div>
      <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", color: "rgba(226,232,240,0.75)", fontSize: 12 }}>
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function fmtWhen(iso: string | null | undefined) {
  return iso ? String(iso).slice(0, 19).replace("T", " ") : "—";
}

export function JobActionGuards(props: Props) {
  const payoutUpper = String(props.payoutStatus ?? "").toUpperCase();
  const statusUpper = String(props.jobStatus ?? "").toUpperCase();
  const isReleased = payoutUpper === "RELEASED";
  const isDisputed = statusUpper.includes("DISPUT");

  const canMutate = props.adminTier !== "ADMIN_VIEWER";
  const canFinancialOverride = props.adminTier === "ADMIN_SUPER";

  const [approveReason, setApproveReason] = useState("");
  const approveReasonOk = approveReason.trim().length >= 3;

  const [archiveReason, setArchiveReason] = useState("");
  const archiveReasonOk = archiveReason.trim().length >= 3;

  const [approvePreviewOpen, setApprovePreviewOpen] = useState(false);
  const [approvePreview, setApprovePreview] = useState<any | null>(null);
  const [approvePreviewErr, setApprovePreviewErr] = useState<string | null>(null);
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [approveAck, setApproveAck] = useState(false);

  const [refundPreviewOpen, setRefundPreviewOpen] = useState(false);
  const [refundPreview, setRefundPreview] = useState<any | null>(null);
  const [refundPreviewErr, setRefundPreviewErr] = useState<string | null>(null);
  const [refundConfirmOpen, setRefundConfirmOpen] = useState(false);

  const [releasePreviewOpen, setReleasePreviewOpen] = useState(false);
  const [releasePreview, setReleasePreview] = useState<any | null>(null);
  const [releasePreviewErr, setReleasePreviewErr] = useState<string | null>(null);
  const [releaseConfirmOpen, setReleaseConfirmOpen] = useState(false);

  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);

  const forceApproveFormRef = useRef<HTMLFormElement | null>(null);
  const refundFormRef = useRef<HTMLFormElement | null>(null);
  const releaseFormRef = useRef<HTMLFormElement | null>(null);
  const archiveFormRef = useRef<HTMLFormElement | null>(null);

  const allowApproveSubmitOnceRef = useRef(false);
  const allowRefundSubmitOnceRef = useRef(false);
  const allowReleaseSubmitOnceRef = useRef(false);
  const allowArchiveSubmitOnceRef = useRef(false);

  async function loadPreview(path: string, init?: RequestInit) {
    const resp = await fetch(path, { cache: "no-store", ...init });
    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json || (json as any).ok === false) {
      const msg = (json as any)?.error || (json as any)?.message || `Preview failed (${resp.status})`;
      throw new Error(String(msg));
    }
    return (json as any)?.data?.preview ?? (json as any)?.preview ?? (json as any)?.data ?? json;
  }

  return (
    <>
      {/* FORCE APPROVE */}
      <div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {pill("FINANCIAL OVERRIDE", "red")}
          {isReleased ? pill("Funds already released", "green") : null}
          {!canFinancialOverride ? pill("Requires SUPER", "red") : null}
        </div>
        <div style={{ marginTop: 10, color: "rgba(226,232,240,0.72)", fontSize: 13, lineHeight: "20px" }}>
          Administrative override. This marks the job as completed/approved and may attempt a funds release.
        </div>
        {props.lastActors?.forceApprove ? (
          <div style={{ marginTop: 8, color: "rgba(226,232,240,0.60)", fontSize: 12 }}>
            Last: {props.lastActors.forceApprove.actorLabel ?? "—"} · {fmtWhen(props.lastActors.forceApprove.whenIso)}
          </div>
        ) : null}

        {canFinancialOverride ? (
          <form
            ref={forceApproveFormRef}
            action={props.act}
            style={{ marginTop: 10, display: "grid", gap: 8 }}
            onSubmit={(e) => {
              if (allowApproveSubmitOnceRef.current) {
                allowApproveSubmitOnceRef.current = false;
                return;
              }
              e.preventDefault();
              if (isReleased) return;

              setApprovePreviewOpen(true);
              setApprovePreview(null);
              setApprovePreviewErr(null);
              (async () => {
                try {
                  const preview = await loadPreview(`/api/admin/jobs/${encodeURIComponent(props.jobId)}/complete?dryRun=true`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ override: true, reason: approveReason || "Admin override" }),
                  });
                  setApprovePreview(preview);
                } catch (err) {
                  setApprovePreviewErr(err instanceof Error ? err.message : "Preview failed");
                }
              })();
            }}
          >
            <input type="hidden" name="jobId" value={props.jobId} />
            <input type="hidden" name="kind" value="force_approve" />
            <textarea
              name="reason"
              placeholder="Reason (required)"
              rows={3}
              style={inputStyle}
              value={approveReason}
              onChange={(e) => setApproveReason(e.target.value)}
            />
            <button type="submit" style={{ ...dangerButtonStyle, opacity: isReleased ? 0.55 : 1, cursor: isReleased ? "not-allowed" : "pointer" }} disabled={isReleased || !approveReasonOk}>
              Force approve
            </button>
          </form>
        ) : (
          <div style={{ marginTop: 10, color: "rgba(226,232,240,0.65)" }}>Hidden: requires SUPER tier.</div>
        )}
      </div>

      <Modal
        open={approvePreviewOpen}
        title="Dry run preview: Force approve"
        confirmLabel="Continue"
        confirmDisabled={!approveReasonOk || !!approvePreviewErr || !approvePreview}
        onCancel={() => setApprovePreviewOpen(false)}
        onConfirm={() => {
          setApprovePreviewOpen(false);
          setApproveConfirmOpen(true);
        }}
      >
        <div style={{ display: "grid", gap: 10 }}>
          {!approveReasonOk ? (
            <div style={{ color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>Reason is required (min 3 characters).</div>
          ) : null}
          {approvePreviewErr ? (
            <div style={{ color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{approvePreviewErr}</div>
          ) : approvePreview ? (
            previewBox(approvePreview)
          ) : (
            <div style={{ color: "rgba(226,232,240,0.70)" }}>Loading preview…</div>
          )}
        </div>
      </Modal>

      <Modal
        open={approveConfirmOpen}
        title="Confirm: Force approve (admin override)"
        confirmLabel="Force approve (admin override)"
        confirmDisabled={!approveAck || !approveReasonOk}
        danger
        onCancel={() => {
          setApproveConfirmOpen(false);
          setApproveAck(false);
        }}
        onConfirm={() => {
          allowApproveSubmitOnceRef.current = true;
          forceApproveFormRef.current?.requestSubmit();
        }}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <div>{pill("High impact action", "red")}</div>
          <div style={{ color: "rgba(226,232,240,0.92)" }}>This action may trigger payout release.</div>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
            <input type="checkbox" checked={approveAck} onChange={(e) => setApproveAck(e.target.checked)} />
            <span style={{ color: "rgba(226,232,240,0.90)" }}>
              I understand: <b>This action may trigger payout release.</b>
            </span>
          </label>
        </div>
      </Modal>

      {/* REFUND */}
      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {pill("FINANCIAL OVERRIDE", "red")}
          {isDisputed ? pill("DISPUTED", "amber") : null}
          {isReleased ? pill("Funds already released", "green") : null}
          {!canFinancialOverride ? pill("Requires SUPER", "red") : null}
        </div>
        <div style={{ marginTop: 10, color: "rgba(226,232,240,0.72)", fontSize: 13, lineHeight: "20px" }}>
          Attempts a Stripe refund via <code>/api/admin/jobs/:id/refund</code>. Backend guards still apply.
        </div>
        {props.lastActors?.refund ? (
          <div style={{ marginTop: 8, color: "rgba(226,232,240,0.60)", fontSize: 12 }}>
            Last: {props.lastActors.refund.actorLabel ?? "—"} · {fmtWhen(props.lastActors.refund.whenIso)}
          </div>
        ) : null}

        {canFinancialOverride ? (
          <form
            ref={refundFormRef}
            action={props.act}
            style={{ marginTop: 10 }}
            onSubmit={(e) => {
              if (allowRefundSubmitOnceRef.current) {
                allowRefundSubmitOnceRef.current = false;
                return;
              }
              e.preventDefault();
              if (isReleased) return;

              setRefundPreviewOpen(true);
              setRefundPreview(null);
              setRefundPreviewErr(null);
              (async () => {
                try {
                  const preview = await loadPreview(`/api/admin/jobs/${encodeURIComponent(props.jobId)}/refund?dryRun=true`, {
                    method: "POST",
                  });
                  setRefundPreview(preview);
                } catch (err) {
                  setRefundPreviewErr(err instanceof Error ? err.message : "Preview failed");
                }
              })();
            }}
          >
            <input type="hidden" name="jobId" value={props.jobId} />
            <input type="hidden" name="kind" value="refund" />
            <button type="submit" style={{ ...dangerButtonStyle, opacity: isReleased ? 0.55 : 1, cursor: isReleased ? "not-allowed" : "pointer" }} disabled={isReleased}>
              Force refund
            </button>
            {isReleased ? (
              <div style={{ marginTop: 8, color: "rgba(226,232,240,0.65)", fontSize: 12 }}>
                Cannot refund after funds released.
              </div>
            ) : null}
          </form>
        ) : (
          <div style={{ marginTop: 10, color: "rgba(226,232,240,0.65)" }}>Hidden: requires SUPER tier.</div>
        )}
      </div>

      <Modal
        open={refundPreviewOpen}
        title="Dry run preview: Refund"
        confirmLabel="Continue"
        confirmDisabled={!!refundPreviewErr || !refundPreview}
        onCancel={() => setRefundPreviewOpen(false)}
        onConfirm={() => {
          setRefundPreviewOpen(false);
          setRefundConfirmOpen(true);
        }}
      >
        <div style={{ display: "grid", gap: 10 }}>
          {refundPreviewErr ? (
            <div style={{ color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{refundPreviewErr}</div>
          ) : refundPreview ? (
            previewBox(refundPreview)
          ) : (
            <div style={{ color: "rgba(226,232,240,0.70)" }}>Loading preview…</div>
          )}
        </div>
      </Modal>

      <Modal
        open={refundConfirmOpen}
        title={isDisputed ? "Warning: Job is disputed" : "Confirm: Refund"}
        confirmLabel="Proceed with refund attempt"
        danger
        onCancel={() => setRefundConfirmOpen(false)}
        onConfirm={() => {
          allowRefundSubmitOnceRef.current = true;
          refundFormRef.current?.requestSubmit();
        }}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <div>{pill("High impact action", "red")}</div>
          <div>This action may create a Stripe refund. Backend may refuse if disputed or after funds release.</div>
        </div>
      </Modal>

      {/* MANUAL RELEASE */}
      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {pill("FINANCIAL", "red")}
          {!canFinancialOverride ? pill("Requires SUPER", "red") : null}
        </div>
        <div style={{ marginTop: 10, color: "rgba(226,232,240,0.72)", fontSize: 13, lineHeight: "20px" }}>
          Manual release retries the release engine (<code>/api/admin/jobs/:id/release</code>).
        </div>
        {props.lastActors?.manualRelease ? (
          <div style={{ marginTop: 8, color: "rgba(226,232,240,0.60)", fontSize: 12 }}>
            Last: {props.lastActors.manualRelease.actorLabel ?? "—"} · {fmtWhen(props.lastActors.manualRelease.whenIso)}
          </div>
        ) : null}

        {canFinancialOverride ? (
          <form
            ref={releaseFormRef}
            action={props.act}
            style={{ marginTop: 10 }}
            onSubmit={(e) => {
              if (allowReleaseSubmitOnceRef.current) {
                allowReleaseSubmitOnceRef.current = false;
                return;
              }
              e.preventDefault();
              setReleasePreviewOpen(true);
              setReleasePreview(null);
              setReleasePreviewErr(null);
              (async () => {
                try {
                  const preview = await loadPreview(`/api/admin/jobs/${encodeURIComponent(props.jobId)}/release?dryRun=true`, { method: "POST" });
                  setReleasePreview(preview);
                } catch (err) {
                  setReleasePreviewErr(err instanceof Error ? err.message : "Preview failed");
                }
              })();
            }}
          >
            <input type="hidden" name="jobId" value={props.jobId} />
            <input type="hidden" name="kind" value="release" />
            <button type="submit" style={dangerButtonStyle}>
              Manual release
            </button>
          </form>
        ) : (
          <div style={{ marginTop: 10, color: "rgba(226,232,240,0.65)" }}>Hidden: requires SUPER tier.</div>
        )}
      </div>

      <Modal
        open={releasePreviewOpen}
        title="Dry run preview: Manual release"
        confirmLabel="Continue"
        confirmDisabled={!!releasePreviewErr || !releasePreview}
        onCancel={() => setReleasePreviewOpen(false)}
        onConfirm={() => {
          setReleasePreviewOpen(false);
          setReleaseConfirmOpen(true);
        }}
      >
        <div style={{ display: "grid", gap: 10 }}>
          {releasePreviewErr ? (
            <div style={{ color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{releasePreviewErr}</div>
          ) : releasePreview ? (
            previewBox(releasePreview)
          ) : (
            <div style={{ color: "rgba(226,232,240,0.70)" }}>Loading preview…</div>
          )}
        </div>
      </Modal>

      <Modal
        open={releaseConfirmOpen}
        title="Confirm: Manual release"
        confirmLabel="Run release"
        danger
        onCancel={() => setReleaseConfirmOpen(false)}
        onConfirm={() => {
          allowReleaseSubmitOnceRef.current = true;
          releaseFormRef.current?.requestSubmit();
        }}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <div>{pill("High impact action", "red")}</div>
          <div>This action may trigger payout release legs. Proceed only if intended.</div>
        </div>
      </Modal>

      {/* ARCHIVE */}
      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {pill("MUTATION", "amber")}
          {!canMutate ? pill("Requires OPERATOR", "red") : null}
        </div>
        <div style={{ marginTop: 10, color: "rgba(226,232,240,0.72)", fontSize: 13, lineHeight: "20px" }}>
          Archive hides the job from default admin lists. Requires an archive reason.
        </div>
        {props.lastActors?.archive ? (
          <div style={{ marginTop: 8, color: "rgba(226,232,240,0.60)", fontSize: 12 }}>
            Last: {props.lastActors.archive.actorLabel ?? "—"} · {fmtWhen(props.lastActors.archive.whenIso)}
            {props.lastActors.archive.reason ? ` · reason: ${props.lastActors.archive.reason}` : ""}
          </div>
        ) : null}

        {canMutate ? (
          <form
            ref={archiveFormRef}
            action={props.act}
            style={{ marginTop: 10, display: "grid", gap: 8 }}
            onSubmit={(e) => {
              if (allowArchiveSubmitOnceRef.current) {
                allowArchiveSubmitOnceRef.current = false;
                return;
              }
              e.preventDefault();
              setArchiveConfirmOpen(true);
            }}
          >
            <input type="hidden" name="jobId" value={props.jobId} />
            <input type="hidden" name="kind" value="archive" />
            <textarea
              name="archiveReason"
              placeholder="Archive reason (required)"
              rows={2}
              style={inputStyle}
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
            />
            <button type="submit" style={dangerButtonStyle} disabled={!archiveReasonOk}>
              Cancel (Archive)
            </button>
          </form>
        ) : (
          <div style={{ marginTop: 10, color: "rgba(226,232,240,0.65)" }}>Hidden: requires OPERATOR tier.</div>
        )}
      </div>

      <Modal
        open={archiveConfirmOpen}
        title="Confirm: Archive job"
        confirmLabel="Archive job"
        confirmDisabled={!archiveReasonOk}
        danger
        onCancel={() => setArchiveConfirmOpen(false)}
        onConfirm={() => {
          allowArchiveSubmitOnceRef.current = true;
          archiveFormRef.current?.requestSubmit();
        }}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <div>{pill("Admin mutation", "amber")}</div>
          <div>Archiving is not a refund. It hides this job from default job lists.</div>
          {archiveReasonOk ? previewBox({ archiveReason: archiveReason.trim() }) : <div>Archive reason is required.</div>}
        </div>
      </Modal>
    </>
  );
}

