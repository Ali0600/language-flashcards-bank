import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { cards, cardSightings, photos, type Card } from '@/db/schema';
import {
  FOLDER_LABELS,
  UNCATEGORIZED_SLUG,
  type AnyFolderSlug,
} from '@/constants/folders';
import { useAsyncQuery, type AsyncQueryResult } from '@/hooks/use-async-query';

export type FolderSummary = {
  slug: AnyFolderSlug;
  label: string;
  cardCount: number;
};

export function useFolders(): AsyncQueryResult<FolderSummary[]> {
  return useAsyncQuery<FolderSummary[]>([], async () => {
    const slugSql = sql<string>`COALESCE(${photos.category}, ${UNCATEGORIZED_SLUG})`;
    const countSql = sql<number>`COUNT(DISTINCT ${cardSightings.cardId})`;
    const rows = await db
      .select({ slug: slugSql.as('slug'), cardCount: countSql.as('card_count') })
      .from(photos)
      .innerJoin(cardSightings, eq(cardSightings.photoId, photos.id))
      .groupBy(slugSql)
      .all();

    return rows
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
  });
}

export type FolderCard = Card & { sightingCount: number };

export function useFolderCards(slug: string | undefined): AsyncQueryResult<FolderCard[]> {
  return useAsyncQuery<FolderCard[]>(
    [],
    async () => {
      if (!slug) return [];

      const photoMatch =
        slug === UNCATEGORIZED_SLUG ? isNull(photos.category) : eq(photos.category, slug);

      const cardIdRows = await db
        .selectDistinct({ cardId: cardSightings.cardId })
        .from(cardSightings)
        .innerJoin(photos, eq(photos.id, cardSightings.photoId))
        .where(photoMatch)
        .all();
      const cardIds = cardIdRows.map((r) => r.cardId);
      if (cardIds.length === 0) return [];

      // Folders only show forward cards since sightings are attached to the
      // de_to_en row. Reverse siblings live alongside but aren't tied to a
      // photo's category.
      const inFolder = await db
        .select()
        .from(cards)
        .where(and(inArray(cards.id, cardIds), eq(cards.direction, 'de_to_en')))
        .orderBy(asc(cards.lemma))
        .all();

      const countSql = sql<number>`COUNT(*)`;
      const countRows = await db
        .select({ cardId: cardSightings.cardId, n: countSql.as('sighting_count') })
        .from(cardSightings)
        .where(inArray(cardSightings.cardId, cardIds))
        .groupBy(cardSightings.cardId)
        .all();
      const countMap = new Map(countRows.map((r) => [r.cardId, r.n]));

      return inFolder
        .map((c) => ({ ...c, sightingCount: countMap.get(c.id) ?? 0 }))
        .sort((a, b) => b.sightingCount - a.sightingCount || a.lemma.localeCompare(b.lemma));
    },
    [slug],
  );
}
