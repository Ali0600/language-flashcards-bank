import { and, count, desc, eq, gte, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { cardSightings, cards, photos, reviewLogs } from '@/db/schema';
import { useAsyncQuery, type AsyncQueryResult } from '@/hooks/use-async-query';
import { bucketByDay, computeStreaks, type DayBucket } from '@/services/streaks';

export type StateBreakdown = { new: number; learning: number; review: number; relearning: number };

export type TopFrequencyEntry = {
  cardId: string;
  lemma: string;
  gender: string | null;
  sightingCount: number;
};

export const HEATMAP_DAYS = 84; // 12 weeks × 7

export type Stats = {
  totalCards: number;
  breakdown: StateBreakdown;
  totalReviews: number;
  reviewsToday: number;
  totalPhotos: number;
  totalSightings: number;
  topFrequency: TopFrequencyEntry[];
  heatmap: DayBucket[];
  currentStreak: number;
  longestStreak: number;
};

const EMPTY: Stats = {
  totalCards: 0,
  breakdown: { new: 0, learning: 0, review: 0, relearning: 0 },
  totalReviews: 0,
  reviewsToday: 0,
  totalPhotos: 0,
  totalSightings: 0,
  topFrequency: [],
  heatmap: [],
  currentStreak: 0,
  longestStreak: 0,
};

export function useStats(): AsyncQueryResult<Stats> {
  return useAsyncQuery<Stats>(EMPTY, async () => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const stateCounts = await db
      .select({ state: cards.state, n: count() })
      .from(cards)
      .groupBy(cards.state)
      .all();
    const breakdown: StateBreakdown = { new: 0, learning: 0, review: 0, relearning: 0 };
    for (const row of stateCounts) {
      if (row.state === 0) breakdown.new = row.n;
      else if (row.state === 1) breakdown.learning = row.n;
      else if (row.state === 2) breakdown.review = row.n;
      else if (row.state === 3) breakdown.relearning = row.n;
    }
    const totalCards = breakdown.new + breakdown.learning + breakdown.review + breakdown.relearning;

    const [{ n: totalReviews } = { n: 0 }] = await db
      .select({ n: count() })
      .from(reviewLogs)
      .all();

    const [{ n: reviewsToday } = { n: 0 }] = await db
      .select({ n: count() })
      .from(reviewLogs)
      .where(gte(reviewLogs.reviewedAt, startOfDay.getTime()))
      .all();

    const [{ n: totalSightings } = { n: 0 }] = await db
      .select({ n: count() })
      .from(cardSightings)
      .all();

    const [{ n: totalPhotos } = { n: 0 }] = await db
      .select({ n: count() })
      .from(photos)
      .all();

    const freqQ = sql<number>`COUNT(${cardSightings.id})`.as('freq');
    const topRows = await db
      .select({
        cardId: cards.id,
        lemma: cards.lemma,
        gender: cards.gender,
        freq: freqQ,
      })
      .from(cards)
      .leftJoin(cardSightings, eq(cardSightings.cardId, cards.id))
      .where(and(eq(cards.state, 0)))
      .groupBy(cards.id)
      .orderBy(desc(freqQ))
      .limit(5)
      .all();

    // Heatmap: pull review timestamps within the rolling window.
    const windowStart = Date.now() - HEATMAP_DAYS * 24 * 60 * 60 * 1000;
    const heatmapRows = await db
      .select({ reviewedAt: reviewLogs.reviewedAt })
      .from(reviewLogs)
      .where(gte(reviewLogs.reviewedAt, windowStart))
      .all();
    const heatmap = bucketByDay(
      heatmapRows.map((r) => r.reviewedAt),
      HEATMAP_DAYS,
    );
    const { current: currentStreak, longest: longestStreak } = computeStreaks(heatmap);

    return {
      totalCards,
      breakdown,
      totalReviews,
      reviewsToday,
      totalPhotos,
      totalSightings,
      topFrequency: topRows
        .filter((r) => r.freq > 0)
        .map((r) => ({
          cardId: r.cardId,
          lemma: r.lemma,
          gender: r.gender,
          sightingCount: r.freq,
        })),
      heatmap,
      currentStreak,
      longestStreak,
    };
  });
}
