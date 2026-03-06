"use client";

import React, { useState } from "react";

type BulkAction =
  | "suspend_1w"
  | "suspend_1m"
  | "suspend_3m"
  | "suspend_6m"
  | "archive"
  | "delete"
  | "edit";

const ACTION_OPTIONS: { value: BulkAction; label: string }[] = [
  { value: "suspend_1w", label: "Suspend (1 week)" },
  { value: "suspend_1m", label: "Suspend (1 month)" },
  { value: "suspend_3m", label: "Suspend (3 months)" },
  { value: "suspend_6m", label: "Suspend (6 months)" },
  { value: "archive", label: "Archive" },
  { value: "delete", label: "Delete" },
  { value: "edit", label: "Edit Profile" },
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
  background: "rgba(59,130,246,0.85)",
  border: "1px solid rgba(59,130,246,0.40)",
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

export function BulkActionBar({
  selectedCount,
  onApply,
}: {
  selectedCount: number;
  onApply: (action: BulkAction) => void;
}) {
  const [action, setAction] = useState<BulkAction | "">("");
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
        onChange={(e) => setAction(e.target.value as BulkAction | "")}
        style={selectStyle}
      >
        <option value="">Bulk Actions</option>
        {ACTION_OPTIONS.map((o) => (
          <option
            key={o.value}
            value={o.value}
            disabled={o.value === "edit" && selectedCount !== 1}
          >
            {o.label}{o.value === "edit" && selectedCount !== 1 ? " (select 1)" : ""}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) onApply(action as BulkAction);
        }}
        style={disabled ? btnDisabled : btnStyle}
      >
        Apply
      </button>
    </div>
  );
}
