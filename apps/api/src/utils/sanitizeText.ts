export function stripHtml(input: string): string {
  // Basic hardening: remove tags + script/style blocks.
  // This is not a full HTML parser (by design); we only need to prevent HTML injection in stored text.
  return String(input ?? "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?[^>]+>/g, "");
}

export function truncateText(input: string, max: number): string {
  const s = String(input ?? "");
  if (!Number.isFinite(max) || max <= 0) return "";
  return s.length <= max ? s : s.slice(0, max);
}

export function sanitizeText(input: string, opts: { maxLen: number; trim?: boolean } = { maxLen: 5000 }): string {
  const stripped = stripHtml(String(input ?? ""));
  const trimmed = opts.trim === false ? stripped : stripped.trim();
  return truncateText(trimmed, opts.maxLen);
}

