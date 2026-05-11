import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { and, asc, desc, eq, gte, lte, ne, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { cards, cardSightings, reviewLogs, type Card } from '@/db/schema';
import { DEFAULT_SETTINGS, getSetting, SettingKeys } from '@/services/settings';

type LoadState<T> = { loading: boolean; data: T; error: Error | null; refetch: () => void };

function startOfDayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function useDueCards(): LoadState<Card[]> {
  const [state, setState] = useState<Omit<LoadState<Card[]>, 'refetch'>>({
    loading: true,
    data: [],
    error: null,
  });
  const [version, setVersion] = useState(0);
  const refetch = useCallback(() => setVersion((v) => v + 1), []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const now = Date.now();
          const limit = await getSetting<number>(
            SettingKeys.dailyNewCardLimit,
            DEFAULT_SETTINGS.dailyNewCardLimit,
          );

          const introducedToday = await db
            .selectDistinct({ cardId: reviewLogs.cardId })
            .from(reviewLogs)
            .where(gte(reviewLogs.reviewedAt, startOfDayMs()))
            .all();
          const quota = Math.max(0, limit - introducedToday.length);

          const nonNew = await db
            .select()
            .from(cards)
            .where(and(lte(cards.due, now), ne(cards.state, 0)))
            .orderBy(asc(cards.due))
            .all();

          let newCards: Card[] = [];
          if (quota > 0) {
            const freq = sql<number>`COUNT(${cardSightings.id})`.as('freq');
            const ranked = await db
              .select({ card: cards, freq })
              .from(cards)
              .leftJoin(cardSightings, eq(cardSightings.cardId, cards.id))
              .where(and(eq(cards.state, 0), lte(cards.due, now)))
              .groupBy(cards.id)
              .orderBy(desc(freq), asc(cards.lemma))
              .limit(quota)
              .all();
            newCards = ranked.map((r) => r.card);
          }

          if (!cancelled) {
            setState({ loading: false, data: [...nonNew, ...newCards], error: null });
          }
        } catch (e) {
          if (!cancelled) setState({ loading: false, data: [], error: e as Error });
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [version]),
  );

  return { ...state, refetch };
}

export type LibrarySort = 'alphabetical' | 'due' | 'frequency';

export type CardWithFreq = Card & { sightingCount: number };

export function useLibrary(sort: LibrarySort): LoadState<CardWithFreq[]> {
  const [state, setState] = useState<Omit<LoadState<CardWithFreq[]>, 'refetch'>>({
    loading: true,
    data: [],
    error: null,
  });
  const [version, setVersion] = useState(0);
  const refetch = useCallback(() => setVersion((v) => v + 1), []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const orderBy =
            sort === 'alphabetical' ? asc(cards.lemma) : sort === 'due' ? asc(cards.due) : asc(cards.lemma);
          const rows = await db.select().from(cards).orderBy(orderBy).all();

          const counts = new Map<string, number>();
          const sightings = await db
            .select({ cardId: cardSightings.cardId })
            .from(cardSightings)
            .all();
          for (const s of sightings) {
            counts.set(s.cardId, (counts.get(s.cardId) ?? 0) + 1);
          }

          let withFreq: CardWithFreq[] = rows.map((c) => ({
            ...c,
            sightingCount: counts.get(c.id) ?? 0,
          }));

          if (sort === 'frequency') {
            withFreq = withFreq.sort((a, b) => b.sightingCount - a.sightingCount);
          }

          if (!cancelled) setState({ loading: false, data: withFreq, error: null });
        } catch (e) {
          if (!cancelled) setState({ loading: false, data: [], error: e as Error });
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [sort, version]),
  );

  return { ...state, refetch };
}

export function useCard(id: string | undefined): LoadState<Card | null> {
  const [state, setState] = useState<Omit<LoadState<Card | null>, 'refetch'>>({
    loading: true,
    data: null,
    error: null,
  });
  const [version, setVersion] = useState(0);
  const refetch = useCallback(() => setVersion((v) => v + 1), []);

  useFocusEffect(
    useCallback(() => {
      if (!id) {
        setState({ loading: false, data: null, error: null });
        return;
      }
      let cancelled = false;
      db.select()
        .from(cards)
        .where(eq(cards.id, id))
        .limit(1)
        .all()
        .then((rows) => {
          if (!cancelled) {
            setState({ loading: false, data: rows[0] ?? null, error: null });
          }
        })
        .catch((e) => {
          if (!cancelled) setState({ loading: false, data: null, error: e as Error });
        });
      return () => {
        cancelled = true;
      };
    }, [id, version]),
  );

  return { ...state, refetch };
}

export type FrequentNewCard = Card & { sightingCount: number };

export function useFrequencyRanking(limit: number = 5): LoadState<FrequentNewCard[]> {
  const [state, setState] = useState<Omit<LoadState<FrequentNewCard[]>, 'refetch'>>({
    loading: true,
    data: [],
    error: null,
  });
  const [version, setVersion] = useState(0);
  const refetch = useCallback(() => setVersion((v) => v + 1), []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const freq = sql<number>`COUNT(${cardSightings.id})`.as('freq');
      db.select({
        card: cards,
        freq,
      })
        .from(cards)
        .leftJoin(cardSightings, eq(cardSightings.cardId, cards.id))
        .where(eq(cards.state, 0))
        .groupBy(cards.id)
        .orderBy(desc(freq), asc(cards.lemma))
        .limit(limit)
        .all()
        .then((rows) => {
          if (cancelled) return;
          const data = rows
            .filter((r) => r.freq > 0)
            .map((r) => ({ ...r.card, sightingCount: r.freq }));
          setState({ loading: false, data, error: null });
        })
        .catch((e) => {
          if (!cancelled) setState({ loading: false, data: [], error: e as Error });
        });
      return () => {
        cancelled = true;
      };
    }, [limit, version]),
  );

  return { ...state, refetch };
}

export function useCardSightings(cardId: string | undefined) {
  const [data, setData] = useState<{ photoId: string; surfaceForm: string; seenAt: number }[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!cardId) return;
      let cancelled = false;
      db.select({
        photoId: cardSightings.photoId,
        surfaceForm: cardSightings.surfaceForm,
        seenAt: cardSightings.seenAt,
      })
        .from(cardSightings)
        .where(eq(cardSightings.cardId, cardId))
        .orderBy(desc(cardSightings.seenAt))
        .all()
        .then((rows) => {
          if (!cancelled) setData(rows);
        })
        .catch((e) => console.error('sightings load failed', e));
      return () => {
        cancelled = true;
      };
    }, [cardId]),
  );

  return data;
}
