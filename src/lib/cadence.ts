/**
 * Build N future local wall-clock slots from a start date + daily times.
 * Returns ISO UTC strings suitable for Buffer customScheduled dueAt.
 *
 * @param startDate YYYY-MM-DD (local calendar day)
 * @param timesOfDay HH:mm strings, 1–3 entries, sorted as given
 * @param count number of slots needed
 * @param now reference "now" (defaults to Date.now()); past slots on day 0 are skipped
 */
export function buildCadenceSlots(params: {
  startDate: string;
  timesOfDay: string[];
  count: number;
  now?: Date;
}): string[] {
  const { startDate, timesOfDay, count } = params;
  const now = params.now ?? new Date();

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
  // Parse start as local midnight
  const [y, m, d] = startDate.split("-").map(Number);
  let dayOffset = 0;

  while (slots.length < count && dayOffset < 3660) {
    for (const time of timesOfDay) {
      if (slots.length >= count) break;
      const [hh, mm] = time.split(":").map(Number);
      const local = new Date(y, m - 1, d + dayOffset, hh, mm, 0, 0);
      if (local.getTime() <= now.getTime()) continue;
      slots.push(local.toISOString());
    }
    dayOffset += 1;
  }

  if (slots.length < count) {
    throw new Error("Could not build enough future cadence slots");
  }
  return slots;
}

/** Format ISO dueAt for display in local timezone. */
export function formatLocalDueAt(iso: string): string {
  return new Date(iso).toLocaleString();
}
