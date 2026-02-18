"use client";

import { useMemo, useState } from "react";

export function CopyJsonClient({ payload }: { payload: unknown }) {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => JSON.stringify(payload, null, 2), [payload]);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // no-op (clipboard might be blocked)
    }
  }

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={onCopy}
        style={{
          background: "rgba(56,189,248,0.14)",
          border: "1px solid rgba(56,189,248,0.35)",
          color: "rgba(186,230,253,0.95)",
          borderRadius: 12,
          padding: "8px 10px",
          fontSize: 12,
          fontWeight: 950,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {copied ? "Copied" : "Copy JSON"}
      </button>
      <span style={{ color: "rgba(226,232,240,0.62)", fontSize: 12 }}>{copied ? "Copied to clipboard" : "Debug payload for tickets"}</span>
    </div>
  );
}

