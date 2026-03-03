export type SuspensionDuration = "1w" | "1m" | "3m" | "6m";

function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

/**
 * Returns the end date for a suspension given a duration code.
 * 1w = 7 days, 1m = 30 days, 3m = 90 days, 6m = 180 days.
 */
export function getSuspensionEnd(duration: SuspensionDuration): Date {
  const now = new Date();
  switch (duration) {
    case "1w":
      return addDays(now, 7);
    case "1m":
      return addDays(now, 30);
    case "3m":
      return addDays(now, 90);
    case "6m":
      return addDays(now, 180);
  }
}
