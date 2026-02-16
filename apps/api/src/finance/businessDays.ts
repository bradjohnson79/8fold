export type CountryCode = "US" | "CA";

type YMD = { y: number; m: number; d: number };

function toYMD(date: Date): YMD {
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

function fromYMD({ y, m, d }: YMD): Date {
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function addDays(date: Date, days: number): Date {
  const t = new Date(date.getTime());
  t.setUTCDate(t.getUTCDate() + days);
  return t;
}

function isWeekend(date: Date): boolean {
  const dow = date.getUTCDay(); // 0 Sun .. 6 Sat
  return dow === 0 || dow === 6;
}

function nthDowOfMonthUTC(y: number, m: number, dow: number, nth: number): Date {
  // nth: 1..5
  const first = new Date(Date.UTC(y, m - 1, 1));
  const firstDow = first.getUTCDay();
  const delta = (dow - firstDow + 7) % 7;
  const day = 1 + delta + (nth - 1) * 7;
  return new Date(Date.UTC(y, m - 1, day));
}

function lastDowOfMonthUTC(y: number, m: number, dow: number): Date {
  const firstNext = new Date(Date.UTC(y, m, 1));
  const lastDay = addDays(firstNext, -1);
  const lastDow = lastDay.getUTCDay();
  const delta = (lastDow - dow + 7) % 7;
  return addDays(lastDay, -delta);
}

// Meeus/Jones/Butcher Gregorian Easter (UTC date)
function easterSundayUTC(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=Mar, 4=Apr
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function observedFixedHolidayUTC(y: number, m: number, d: number): Date {
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay();
  // If on Saturday -> observed Friday; if Sunday -> observed Monday
  if (dow === 6) return addDays(date, -1);
  if (dow === 0) return addDays(date, 1);
  return date;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate();
}

function usHolidaysUTC(year: number): Date[] {
  return [
    observedFixedHolidayUTC(year, 1, 1), // New Year's Day
    nthDowOfMonthUTC(year, 1, 1, 3), // MLK Day (3rd Mon Jan)
    nthDowOfMonthUTC(year, 2, 1, 3), // Presidents' Day (3rd Mon Feb)
    lastDowOfMonthUTC(year, 5, 1), // Memorial Day (last Mon May)
    observedFixedHolidayUTC(year, 6, 19), // Juneteenth
    observedFixedHolidayUTC(year, 7, 4), // Independence Day
    nthDowOfMonthUTC(year, 9, 1, 1), // Labor Day (1st Mon Sep)
    nthDowOfMonthUTC(year, 10, 1, 2), // Columbus/Indigenous Peoples (2nd Mon Oct)
    observedFixedHolidayUTC(year, 11, 11), // Veterans Day
    nthDowOfMonthUTC(year, 11, 4, 4), // Thanksgiving (4th Thu Nov)
    observedFixedHolidayUTC(year, 12, 25) // Christmas
  ];
}

function caHolidaysUTC(year: number): Date[] {
  const easter = easterSundayUTC(year);
  const goodFriday = addDays(easter, -2);
  // Victoria Day: Monday before May 25
  const may25 = new Date(Date.UTC(year, 4, 25));
  const victoria = addDays(may25, -(((may25.getUTCDay() + 6) % 7) + 1)); // back to Monday
  return [
    observedFixedHolidayUTC(year, 1, 1), // New Year's Day
    nthDowOfMonthUTC(year, 2, 1, 3), // Family Day (most provinces; acceptable v1)
    goodFriday,
    victoria,
    observedFixedHolidayUTC(year, 7, 1), // Canada Day
    nthDowOfMonthUTC(year, 9, 1, 1), // Labour Day
    observedFixedHolidayUTC(year, 9, 30), // Truth and Reconciliation Day
    nthDowOfMonthUTC(year, 10, 1, 2), // Thanksgiving (2nd Mon Oct)
    observedFixedHolidayUTC(year, 11, 11), // Remembrance Day
    observedFixedHolidayUTC(year, 12, 25), // Christmas
    observedFixedHolidayUTC(year, 12, 26) // Boxing Day
  ];
}

export function isHolidayUTC(date: Date, country: CountryCode): boolean {
  const y = date.getUTCFullYear();
  const list = country === "CA" ? caHolidaysUTC(y) : usHolidaysUTC(y);
  return list.some((h) => sameDay(h, date));
}

export function nextBusinessDayUTC(fromDate: Date, country: CountryCode): Date {
  // Next business day AFTER fromDate
  let d = fromYMD(toYMD(addDays(fromDate, 1)));
  while (isWeekend(d) || isHolidayUTC(d, country)) {
    d = addDays(d, 1);
  }
  return d;
}

