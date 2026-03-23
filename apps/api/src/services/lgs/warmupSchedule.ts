/**
 * LGS: Warmup ramp schedule and utility functions.
 * Shared between the warmup API, warmup worker, and warmup actions.
 */

export const WARMUP_SCHEDULE: Record<number, number> = {
  1: 5,
  2: 10,
  3: 20,
  4: 35,
  5: 50,
};

const MAX_DAY = Math.max(...Object.keys(WARMUP_SCHEDULE).map(Number));

export function getDailyLimit(day: number): number {
  if (day <= 0) return 0;
  if (day >= MAX_DAY) return WARMUP_SCHEDULE[MAX_DAY]!;
  return WARMUP_SCHEDULE[day] ?? WARMUP_SCHEDULE[MAX_DAY]!;
}

export function getNextDayLimit(day: number): number {
  return getDailyLimit(day + 1);
}

export function isReadyForOutreach(
  day: number,
  status: string,
  stabilityVerified = false
): boolean {
  return stabilityVerified && (status === "ready" || (status === "warming" && getDailyLimit(day) >= 50));
}
