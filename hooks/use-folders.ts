import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { asc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { cards, cardSightings, photos, type Card } from '@/db/schema';
import {
  FOLDER_LABELS,
  UNCATEGORIZED_SLUG,
  type AnyFolderSlug,
} from '@/constants/folders';

type LoadState<T> = { loading: boolean; data: T; error: Error | null; refetch: () => void };

export type FolderSummary = {
  slug: AnyFolderSlug;
  label: string;
  cardCount: number;
};

export function useFolders(): LoadState<FolderSummary[]> {
  const [state, setState] = useState<Omit<LoadState<FolderSummary[]>, 'refetch'>>({
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
          const slugSql = sql<string>`COALESCE(${photos.category}, ${UNCATEGORIZED_SLUG})`;
          const countSql = sql<number>`COUNT(DISTINCT ${cardSightings.cardId})`;
          const rows = await db
            .select({ slug: slugSql.as('slug'), cardCount: countSql.as('card_count') })
            .from(photos)
            .innerJoin(cardSightings, eq(cardSightings.photoId, photos.id))
            .groupBy(slugSql)
            .all();

          const summaries: FolderSummary[] = rows
            .filter((r) => r.cardCount > 0)
            .map((r) => {
              const slug = (r.slug ?? UNCATEGORIZED_SLUG) as AnyFolderSlug;
              return {
                slug,
                label: FOLDER_LABELS[slug] ?? FOLDER_LABELS.other,
                cardCount: r.cardCount,
              };
            })
            .sort((a, b) => b.cardCount - a.cardCount || a.label.localeCompare(b.label));

          if (!cancelled) setState({ loading: false, data: summaries, error: null });
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

export type FolderCard = Card & { sightingCount: number };

export function useFolderCards(slug: string | undefined): LoadState<FolderCard[]> {
  const [state, setState] = useState<Omit<LoadState<FolderCard[]>, 'refetch'>>({
    loading: true,
    data: [],
    error: null,
  });
  const [version, setVersion] = useState(0);
  const refetch = useCallback(() => setVersion((v) => v + 1), []);

  useFocusEffect(
    useCallback(() => {
      if (!slug) {
        setState({ loading: false, data: [], error: null });
        return;
      }
      let cancelled = false;
      (async () => {
        try {
          const photoMatch =
            slug === UNCATEGORIZED_SLUG ? isNull(photos.category) : eq(photos.category, slug);

          const cardIdRows = await db
            .selectDistinct({ cardId: cardSightings.cardId })
            .from(cardSightings)
            .innerJoin(photos, eq(photos.id, cardSightings.photoId))
            .where(photoMatch)
            .all();
          const cardIds = new Set(cardIdRows.map((r) => r.cardId));

          if (cardIds.size === 0) {
            if (!cancelled) setState({ loading: false, data: [], error: null });
            return;
          }

          const allCards = await db.select().from(cards).orderBy(asc(cards.lemma)).all();
          const inFolder = allCards.filter((c) => cardIds.has(c.id));

          const counts = new Map<string, number>();
          const sightingRows = await db
            .select({ cardId: cardSightings.cardId })
            .from(cardSightings)
            .all();
          for (const s of sightingRows) {
            counts.set(s.cardId, (counts.get(s.cardId) ?? 0) + 1);
          }

          const withFreq: FolderCard[] = inFolder
            .map((c) => ({ ...c, sightingCount: counts.get(c.id) ?? 0 }))
            .sort((a, b) => b.sightingCount - a.sightingCount || a.lemma.localeCompare(b.lemma));

          if (!cancelled) setState({ loading: false, data: withFreq, error: null });
        } catch (e) {
          if (!cancelled) setState({ loading: false, data: [], error: e as Error });
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [slug, version]),
  );

  return { ...state, refetch };
}
