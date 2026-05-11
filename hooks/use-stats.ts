import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { and, count, desc, eq, gte, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { cardSightings, cards, reviewLogs } from '@/db/schema';

export type StateBreakdown = { new: number; learning: number; review: number; relearning: number };

export type TopFrequencyEntry = {
  cardId: string;
  lemma: string;
  gender: string | null;
  sightingCount: number;
};

export type Stats = {
  totalCards: number;
  breakdown: StateBreakdown;
  totalReviews: number;
  reviewsToday: number;
  totalPhotos: number;
  totalSightings: number;
  topFrequency: TopFrequencyEntry[];
};

const EMPTY: Stats = {
  totalCards: 0,
  breakdown: { new: 0, learning: 0, review: 0, relearning: 0 },
  totalReviews: 0,
  reviewsToday: 0,
  totalPhotos: 0,
  totalSightings: 0,
  topFrequency: [],
};

export function useStats() {
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const refetch = useCallback(() => setVersion((v) => v + 1), []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
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

          const photoRows = await db
            .selectDistinct({ photoId: cardSightings.photoId })
            .from(cardSightings)
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

          if (cancelled) return;
          setStats({
            totalCards,
            breakdown,
            totalReviews,
            reviewsToday,
            totalPhotos: photoRows.length,
            totalSightings,
            topFrequency: topRows
              .filter((r) => r.freq > 0)
              .map((r) => ({
                cardId: r.cardId,
                lemma: r.lemma,
                gender: r.gender,
                sightingCount: r.freq,
              })),
          });
          setLoading(false);
        } catch (e) {
          console.error('useStats failed', e);
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [version]),
  );

  return { stats, loading, refetch };
}
