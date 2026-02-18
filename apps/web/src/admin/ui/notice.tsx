import React from "react";
import { AdminColors } from "./theme";

export function Notice({ text }: { text: string }) {
  return (
    <div
      style={{
        marginTop: 10,
        padding: "10px 12px",
        borderRadius: 12,
        border: `1px solid ${AdminColors.border}`,
        background: AdminColors.graySoft,
        color: AdminColors.text,
        fontSize: 13,
      }}
    >
      <span style={{ fontWeight: 900, color: AdminColors.green }}>Recorded:</span>{" "}
      <span style={{ color: AdminColors.muted }}>{text}</span>
    </div>
  );
}

