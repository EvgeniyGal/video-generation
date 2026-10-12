/**
 * Build N future wall-clock slots from a start date + daily times in a timezone.
 * Returns ISO UTC strings suitable for Buffer customScheduled dueAt.
 *
 * @param startDate YYYY-MM-DD (calendar day in `timeZone`)
 * @param timesOfDay HH:mm strings, 1–3 entries, sorted as given
 * @param count number of slots needed
 * @param timeZone IANA timezone (defaults to runtime local)
 * @param now reference "now" (defaults to Date.now()); past slots on day 0 are skipped
 */
export function buildCadenceSlots(params: {
  startDate: string;
  timesOfDay: string[];
  count: number;
  timeZone?: string;
  now?: Date;
}): string[] {
  const { startDate, timesOfDay, count } = params;
  const now = params.now ?? new Date();
  const timeZone = params.timeZone || guessBrowserTimeZone();

  if (count <= 0) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    throw new Error("startDate must be YYYY-MM-DD");
  }
  if (!timesOfDay.length || timesOfDay.length > 3) {
    throw new Error("timesOfDay must have 1–3 HH:mm entries");
  }
  for (const t of timesOfDay) {
    if (!/^\d{2}:\d{2}$/.test(t)) {
      throw new Error(`Invalid time: ${t}`);
    }
  }

  const slots: string[] = [];
  const [y0, m0, d0] = startDate.split("-").map(Number);
  let dayOffset = 0;

  while (slots.length < count && dayOffset < 3660) {
    const { year, month, day } = addCalendarDays(y0, m0, d0, dayOffset);
    for (const time of timesOfDay) {
      if (slots.length >= count) break;
      const [hh, mm] = time.split(":").map(Number);
      const utc = wallTimeInZoneToUtc(year, month, day, hh, mm, timeZone);
      if (utc.getTime() <= now.getTime()) continue;
      slots.push(utc.toISOString());
    }
    dayOffset += 1;
  }

  if (slots.length < count) {
    throw new Error("Could not build enough future cadence slots");
  }
  return slots;
}

/** Convert datetime-local value (YYYY-MM-DDTHH:mm) in a timezone to UTC ISO. */
export function datetimeLocalInZoneToIso(
  datetimeLocal: string,
  timeZone: string,
): string {
  const m = datetimeLocal.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!m) throw new Error("Invalid datetime-local value");
  const [, ys, mos, ds, hs, mins, ss] = m;
  const utc = wallTimeInZoneToUtc(
    Number(ys),
    Number(mos),
    Number(ds),
    Number(hs),
    Number(mins),
    timeZone,
    Number(ss ?? 0),
  );
  return utc.toISOString();
}

/**
 * Interpret year/month/day hour:minute as wall clock in `timeZone`, return UTC Date.
 */
export function wallTimeInZoneToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
  second = 0,
): Date {
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  // First guess: treat wall time as UTC, then correct by zone offset at that instant.
  let utcMs = desiredAsUtc;
  for (let i = 0; i < 3; i++) {
    const shown = zonedParts(new Date(utcMs), timeZone);
    const shownAsUtc = Date.UTC(
      shown.year,
      shown.month - 1,
      shown.day,
      shown.hour,
      shown.minute,
      shown.second,
    );
    const delta = desiredAsUtc - shownAsUtc;
    if (delta === 0) break;
    utcMs += delta;
  }
  return new Date(utcMs);
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Add calendar days without JS Date local-tz pitfalls (month/day overflow via UTC). */
function addCalendarDays(
  year: number,
  month: number,
  day: number,
  days: number,
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

export function guessBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Common IANA zones first, then the rest from the runtime when available. */
export function listTimeZones(): string[] {
  const preferred = [
    "Europe/Kyiv",
    "Europe/Warsaw",
    "Europe/Berlin",
    "Europe/London",
    "Europe/Paris",
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Sao_Paulo",
    "Asia/Dubai",
    "Asia/Kolkata",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Australia/Sydney",
  ];
  let all: string[] = [];
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf?.("timeZone");
    if (supported?.length) all = [...supported];
  } catch {
    /* ignore */
  }
  if (!all.length) all = preferred;
  const browser = guessBrowserTimeZone();
  if (browser && !all.includes(browser)) all = [browser, ...all];
  const set = new Set(all);
  const head = [browser, ...preferred].filter(
    (z, i, arr) => z && set.has(z) && arr.indexOf(z) === i,
  );
  const rest = all.filter((z) => !head.includes(z)).sort();
  return [...head, ...rest];
}

/** Format ISO dueAt for display in a timezone (defaults to browser local). */
export function formatLocalDueAt(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleString(undefined, {
    timeZone: timeZone || undefined,
    dateStyle: "medium",
    timeStyle: "short",
  });
}
