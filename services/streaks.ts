/**
 * Pure helpers for the Stats activity heatmap and streak counters.
 *
 * Operates on raw `reviewLogs.reviewedAt` epoch-ms timestamps. All bucketing
 * is done in local time so "today" matches what the user actually did today
 * on their device.
 */

export type DayBucket = { date: string; count: number };

export type Streaks = { current: number; longest: number };

/**
 * Return YYYY-MM-DD for the local-time day containing `ms`. Using local
 * time (not UTC) is important so reviews done at 11:30pm don't get bucketed
 * into tomorrow.
 */
export function localDateKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Add `n` days (positive or negative) to a local-time date and return the
 * resulting Date at local midnight.
 */
function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * Bucket review timestamps into the last `days` calendar days ending today
 * (inclusive). Days with no reviews get a count of 0.
 *
 * Output is ordered oldest → newest.
 */
export function bucketByDay(
  timestamps: number[],
  days: number,
  now: number = Date.now(),
): DayBucket[] {
  if (days <= 0) return [];
  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);

  // Build the per-day map first so multiple timestamps on one day get aggregated.
  const counts = new Map<string, number>();
  for (const ts of timestamps) {
    const key = localDateKey(ts);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const buckets: DayBucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(todayMidnight, -i);
    const key = localDateKey(d.getTime());
    buckets.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return buckets;
}

/**
 * Given day buckets ordered oldest → newest, compute the current streak (run
 * of consecutive active days ending today or yesterday) and the longest
 * streak in the window.
 *
 * Why "today or yesterday" for current: if you haven't reviewed yet today
 * but reviewed yesterday, your streak is intact — you just haven't extended
 * it. Returning 0 in that case would be misleading.
 */
export function computeStreaks(buckets: DayBucket[]): Streaks {
  if (buckets.length === 0) return { current: 0, longest: 0 };

  let longest = 0;
  let run = 0;
  for (const b of buckets) {
    if (b.count > 0) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }

  // Current streak: walk back from the newest bucket. Tolerate today being
  // empty as long as yesterday was active.
  let current = 0;
  const lastIdx = buckets.length - 1;
  const today = buckets[lastIdx];
  if (!today) return { current: 0, longest };
  const startIdx = today.count > 0 ? lastIdx : lastIdx - 1;
  for (let i = startIdx; i >= 0; i--) {
    const b = buckets[i];
    if (b && b.count > 0) current++;
    else break;
  }

  return { current, longest };
}
