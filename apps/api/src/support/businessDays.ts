/**
 * Add business days (Mon–Fri) to a date, preserving the time component.
 * Holidays are not modeled in v1.
 */
export function addBusinessDays(start: Date, businessDays: number): Date {
  if (!Number.isFinite(businessDays) || businessDays < 0) {
    throw new Error("businessDays must be a non-negative finite number");
  }
  let remaining = Math.floor(businessDays);
  const out = new Date(start.getTime());
  while (remaining > 0) {
    out.setDate(out.getDate() + 1);
    const day = out.getDay(); // 0=Sun, 6=Sat
    const isWeekend = day === 0 || day === 6;
    if (!isWeekend) remaining -= 1;
  }
  return out;
}

