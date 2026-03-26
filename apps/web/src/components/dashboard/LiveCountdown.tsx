"use client";

import React from "react";
import { countdownColor, formatInviteCountdown } from "@/utils/formatInviteCountdown";

function useNow(intervalMs: number) {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(intervalId);
  }, [intervalMs]);

  return now;
}

function formatDetailedCountdown(targetIso: string, nowMs: number, expiredText: string) {
  const diff = new Date(targetIso).getTime() - nowMs;
  if (diff <= 0) return expiredText;

  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1_000);

  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

export function DeadlineCountdown({
  targetIso,
  placeholder = "---",
  expiredText = "Expired - refresh to update",
}: {
  targetIso: string | null;
  placeholder?: string;
  expiredText?: string;
}) {
  const nowMs = useNow(1000);

  if (!targetIso) return <>{placeholder}</>;

  return <>{formatDetailedCountdown(targetIso, nowMs, expiredText)}</>;
}

export function InviteCountdown({ expiresAt }: { expiresAt: string }) {
  useNow(1000);

  return <span className={`font-medium ${countdownColor(expiresAt)}`}>{formatInviteCountdown(expiresAt)}</span>;
}
