"use client";

import React, { useState } from "react";

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 50,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0,0,0,0.60)",
};

const cardStyle: React.CSSProperties = {
  background: "rgba(15,23,42,0.98)",
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 16,
  padding: 28,
  width: "100%",
  maxWidth: 440,
  boxShadow: "0 16px 64px rgba(0,0,0,0.50)",
};

const inputStyle: React.CSSProperties = {
  background: "rgba(2,6,23,0.50)",
  border: "1px solid rgba(148,163,184,0.20)",
  color: "rgba(226,232,240,0.92)",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  fontWeight: 700,
  width: "100%",
  marginTop: 12,
};

const btnConfirm: React.CSSProperties = {
  background: "rgba(239,68,68,0.85)",
  border: "1px solid rgba(239,68,68,0.40)",
  color: "#fff",
  borderRadius: 10,
  padding: "10px 20px",
  fontSize: 13,
  fontWeight: 900,
  cursor: "pointer",
};

const btnCancel: React.CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(148,163,184,0.20)",
  color: "rgba(226,232,240,0.80)",
  borderRadius: 10,
  padding: "10px 20px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

export function DeleteConfirmModal({
  action,
  count,
  onConfirm,
  onCancel,
  entityLabel = "account",
  entityPlural = "accounts",
}: {
  action: string;
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
  entityLabel?: string;
  entityPlural?: string;
}) {
  const [typed, setTyped] = useState("");

  const isDelete = action === "delete";
  const confirmWord = isDelete ? "DELETE" : "ARCHIVE";
  const label = isDelete ? "permanently delete" : "archive";
  const confirmed = typed === confirmWord;
  const entity = count === 1 ? entityLabel : entityPlural;

  return (
    <div style={overlayStyle} onClick={onCancel} role="dialog" aria-modal="true">
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 18, fontWeight: 950, color: "rgba(239,68,68,0.95)", marginBottom: 8 }}>
          Dangerous action
        </div>
        <div style={{ fontSize: 14, color: "rgba(226,232,240,0.85)", lineHeight: 1.5 }}>
          You are about to <strong>{label}</strong> {count} {entity}.
          {isDelete ? " This action is permanent and cannot be undone." : " This action cannot be easily undone."}
        </div>
        <div style={{ fontSize: 13, color: "rgba(226,232,240,0.65)", marginTop: 14 }}>
          Type <strong style={{ color: "rgba(239,68,68,0.95)" }}>{confirmWord}</strong> to confirm.
        </div>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={`Type ${confirmWord}`}
          style={inputStyle}
          autoFocus
        />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button type="button" onClick={onCancel} style={btnCancel}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!confirmed}
            onClick={() => { if (confirmed) onConfirm(); }}
            style={{ ...btnConfirm, opacity: confirmed ? 1 : 0.4, cursor: confirmed ? "pointer" : "not-allowed" }}
          >
            Confirm {label}
          </button>
        </div>
      </div>
    </div>
  );
}
