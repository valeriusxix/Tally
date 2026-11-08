// Dates are stored as UTC ISO strings; "today", ranges and display follow the
// business profile's IANA timezone.

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function zonedParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** Minutes the zone is ahead of UTC at this instant. */
export function tzOffsetMinutes(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** Wall-clock time in `tz` -> UTC Date. */
export function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let offset = tzOffsetMinutes(new Date(guess), tz);
  let result = guess - offset * 60000;
  const corrected = tzOffsetMinutes(new Date(result), tz);
  if (corrected !== offset) {
    offset = corrected;
    result = guess - offset * 60000;
  }
  return new Date(result);
}

/** "YYYY-MM-DD" of an instant in `tz`. */
export function localDateKey(value: string | Date, tz: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const p = zonedParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function parseDateKey(key: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** UTC ISO of local midnight starting `dateKey` in `tz`. */
export function startOfLocalDayUtc(dateKey: string, tz: string): string {
  const p = parseDateKey(dateKey);
  if (!p) throw new Error(`Invalid date ${dateKey}; expected YYYY-MM-DD.`);
  return zonedToUtc(p.year, p.month, p.day, 0, 0, tz).toISOString();
}

export function addDays(dateKey: string, days: number): string {
  const p = parseDateKey(dateKey);
  if (!p) throw new Error(`Invalid date ${dateKey}; expected YYYY-MM-DD.`);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return d.toISOString().slice(0, 10);
}

/** Inclusive local date range -> [fromUtc, toUtcExclusive). */
export function localRangeToUtc(from: string, to: string, tz: string) {
  return {
    fromUtc: startOfLocalDayUtc(from, tz),
    toUtc: startOfLocalDayUtc(addDays(to, 1), tz),
  };
}

export function daysBetween(fromDateKey: string, toDateKey: string): number {
  const a = parseDateKey(fromDateKey);
  const b = parseDateKey(toDateKey);
  if (!a || !b) return 0;
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) /
      86400000,
  );
}
