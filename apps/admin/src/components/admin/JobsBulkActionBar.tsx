"use client";

import React, { useState } from "react";

export type JobsBulkAction = "ARCHIVE" | "UNARCHIVE" | "DELETE_SOFT" | "DELETE_TEST_ONLY";

const ACTION_OPTIONS: { value: JobsBulkAction; label: string }[] = [
  { value: "ARCHIVE", label: "Archive" },
  { value: "UNARCHIVE", label: "Unarchive" },
  { value: "DELETE_SOFT", label: "Delete (soft)" },
  { value: "DELETE_TEST_ONLY", label: "Delete (mock only)" },
];

const selectStyle: React.CSSProperties = {
  background: "rgba(2,6,23,0.50)",
  border: "1px solid rgba(148,163,184,0.20)",
  color: "rgba(226,232,240,0.92)",
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 13,
  fontWeight: 700,
  minWidth: 200,
};

const btnStyle: React.CSSProperties = {
  background: "rgba(34,197,94,0.85)",
  border: "1px solid rgba(34,197,94,0.40)",
  color: "#fff",
  borderRadius: 10,
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 900,
  cursor: "pointer",
};

const btnDisabled: React.CSSProperties = {
  ...btnStyle,
  opacity: 0.4,
  cursor: "not-allowed",
};

export function JobsBulkActionBar({
  selectedCount,
  onApply,
}: {
  selectedCount: number;
  onApply: (action: JobsBulkAction) => void;
}) {
  const [action, setAction] = useState<JobsBulkAction | "">("");
  const disabled = selectedCount === 0 || !action;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        border: "1px solid rgba(148,163,184,0.14)",
        borderRadius: 14,
        background: "rgba(2,6,23,0.30)",
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 900, color: "rgba(226,232,240,0.70)" }}>
        {selectedCount} selected
      </span>
      <select
        value={action}
        onChange={(e) => setAction(e.target.value as JobsBulkAction | "")}
        style={selectStyle}
      >
        <option value="">Bulk Actions</option>
        {ACTION_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) onApply(action as JobsBulkAction);
        }}
        style={disabled ? btnDisabled : btnStyle}
      >
        Apply
      </button>
    </div>
  );
}
