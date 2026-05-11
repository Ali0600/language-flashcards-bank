import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { asc, desc, eq, lte, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { cards, cardSightings, type Card } from '@/db/schema';

type LoadState<T> = { loading: boolean; data: T; error: Error | null };

export function useDueCards(): LoadState<Card[]> {
  const [state, setState] = useState<LoadState<Card[]>>({
    loading: true,
    data: [],
    error: null,
  });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      db.select()
        .from(cards)
        .where(lte(cards.due, Date.now()))
        .orderBy(asc(cards.due))
        .all()
        .then((rows) => {
          if (!cancelled) setState({ loading: false, data: rows, error: null });
        })
        .catch((e) => {
          if (!cancelled) setState({ loading: false, data: [], error: e as Error });
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return state;
}

export type LibrarySort = 'alphabetical' | 'due' | 'frequency';

export type CardWithFreq = Card & { sightingCount: number };

export function useLibrary(sort: LibrarySort): LoadState<CardWithFreq[]> {
  const [state, setState] = useState<LoadState<CardWithFreq[]>>({
    loading: true,
    data: [],
    error: null,
  });

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
    }, [sort]),
  );

  return state;
}

export function useCard(id: string | undefined): LoadState<Card | null> {
  const [state, setState] = useState<LoadState<Card | null>>({
    loading: true,
    data: null,
    error: null,
  });

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
    }, [id]),
  );

  return state;
}

export type FrequentNewCard = Card & { sightingCount: number };

export function useFrequencyRanking(limit: number = 5): LoadState<FrequentNewCard[]> {
  const [state, setState] = useState<LoadState<FrequentNewCard[]>>({
    loading: true,
    data: [],
    error: null,
  });

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
    }, [limit]),
  );

  return state;
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
