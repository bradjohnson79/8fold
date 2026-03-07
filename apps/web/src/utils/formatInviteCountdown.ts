export function formatInviteCountdown(expiresAt: string | Date): string {
  const diff = new Date(expiresAt).getTime() - Date.now();

  if (diff <= 0) return "Expired";

  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);

  if (hours >= 1) return `${hours}h`;
  if (minutes >= 30) return "30m";
  if (minutes >= 15) return "15m";
  if (minutes >= 10) return "10m";
  if (minutes >= 5) return "5m";
  if (minutes >= 1) return `${minutes}m`;

  return "<1m";
}

export function countdownColor(expiresAt: string | Date): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 10 * 60_000) return "text-rose-600";
  if (diff <= 60 * 60_000) return "text-amber-600";
  return "text-slate-500";
}
