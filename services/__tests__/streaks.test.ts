import { bucketByDay, computeStreaks, localDateKey } from '../streaks';

// Use a fixed local-time "now" so tests are deterministic across timezones.
// 2026-05-12 14:30 local.
const NOW = new Date(2026, 4, 12, 14, 30, 0, 0).getTime();
const DAY_MS = 24 * 60 * 60 * 1000;
const dayAgo = (n: number) => NOW - n * DAY_MS;

describe('localDateKey', () => {
  it('returns YYYY-MM-DD in local time', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 0).getTime())).toBe('2026-01-05');
  });

  it('zero-pads single-digit months and days', () => {
    expect(localDateKey(new Date(2026, 2, 1, 0, 0).getTime())).toBe('2026-03-01');
  });
});

describe('bucketByDay', () => {
  it('returns exactly N buckets ending today', () => {
    const buckets = bucketByDay([], 7, NOW);
    expect(buckets).toHaveLength(7);
    expect(buckets[6]?.date).toBe('2026-05-12');
    expect(buckets[0]?.date).toBe('2026-05-06');
  });

  it('counts multiple reviews on the same day', () => {
    const today = NOW - 1000;
    const buckets = bucketByDay([today, today, today], 3, NOW);
    expect(buckets[2]?.count).toBe(3);
    expect(buckets[1]?.count).toBe(0);
    expect(buckets[0]?.count).toBe(0);
  });

  it('returns empty array for days <= 0', () => {
    expect(bucketByDay([NOW], 0, NOW)).toEqual([]);
  });

  it('ignores timestamps outside the window', () => {
    const buckets = bucketByDay([dayAgo(100)], 7, NOW);
    expect(buckets.every((b) => b.count === 0)).toBe(true);
  });
});

describe('computeStreaks', () => {
  it('returns zeros for an empty array', () => {
    expect(computeStreaks([])).toEqual({ current: 0, longest: 0 });
  });

  it('counts a current streak ending today', () => {
    // 3 days, all active.
    const buckets = bucketByDay([dayAgo(0), dayAgo(1), dayAgo(2)], 3, NOW);
    expect(computeStreaks(buckets)).toEqual({ current: 3, longest: 3 });
  });

  it('keeps the streak alive if today is empty but yesterday is active', () => {
    // Today: 0. Yesterday + day before: active.
    const buckets = bucketByDay([dayAgo(1), dayAgo(2)], 3, NOW);
    expect(computeStreaks(buckets)).toEqual({ current: 2, longest: 2 });
  });

  it('resets the current streak if both today and yesterday are empty', () => {
    const buckets = bucketByDay([dayAgo(2), dayAgo(3)], 7, NOW);
    expect(computeStreaks(buckets).current).toBe(0);
  });

  it('finds the longest streak even if the current is shorter', () => {
    // 6-day-ago through 4-day-ago active (3 days). Then gap. Then today.
    const buckets = bucketByDay(
      [dayAgo(0), dayAgo(4), dayAgo(5), dayAgo(6)],
      8,
      NOW,
    );
    const result = computeStreaks(buckets);
    expect(result.current).toBe(1);
    expect(result.longest).toBe(3);
  });
});
