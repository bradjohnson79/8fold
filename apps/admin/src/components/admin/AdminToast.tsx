"use client";

import React, { useEffect } from "react";

export function AdminToast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      style={{
        position: "fixed",
        top: 24,
        right: 24,
        zIndex: 60,
        background: "rgba(16,185,129,0.92)",
        color: "#fff",
        padding: "12px 20px",
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 900,
        boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
        maxWidth: 400,
      }}
    >
      {message}
    </div>
  );
}
