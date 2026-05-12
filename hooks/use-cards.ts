import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { cards, cardSightings, photos, reviewLogs, type Card } from '@/db/schema';
import { UNCATEGORIZED_SLUG, type AnyFolderSlug } from '@/constants/folders';
import { DEFAULT_SETTINGS, getSetting, SettingKeys } from '@/services/settings';
import { useAsyncQuery, type AsyncQueryResult } from '@/hooks/use-async-query';

function startOfDayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function useDueCards(): AsyncQueryResult<Card[]> {
  return useAsyncQuery<Card[]>([], async () => {
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

    return [...nonNew, ...newCards];
  });
}

export type LibrarySort = 'alphabetical' | 'due' | 'frequency';

export type CardWithFreq = Card & { sightingCount: number };

export function useLibrary(
  sort: LibrarySort,
  folderFilter: AnyFolderSlug | null = null,
): AsyncQueryResult<CardWithFreq[]> {
  return useAsyncQuery<CardWithFreq[]>(
    [],
    async () => {
      // When a folder filter is active, restrict the card set to those seen in
      // photos of that category (or the uncategorized photos for that slug).
      let restrictedCardIds: string[] | null = null;
      if (folderFilter) {
        const photoMatch =
          folderFilter === UNCATEGORIZED_SLUG
            ? isNull(photos.category)
            : eq(photos.category, folderFilter);
        const idRows = await db
          .selectDistinct({ cardId: cardSightings.cardId })
          .from(cardSightings)
          .innerJoin(photos, eq(photos.id, cardSightings.photoId))
          .where(photoMatch)
          .all();
        restrictedCardIds = idRows.map((r) => r.cardId);
        if (restrictedCardIds.length === 0) return [];
      }

      const orderBy =
        sort === 'alphabetical' ? asc(cards.lemma) : sort === 'due' ? asc(cards.due) : asc(cards.lemma);
      const baseQuery = db.select().from(cards);
      const rows = restrictedCardIds
        ? await baseQuery.where(inArray(cards.id, restrictedCardIds)).orderBy(orderBy).all()
        : await baseQuery.orderBy(orderBy).all();

      const freq = sql<number>`COUNT(${cardSightings.id})`.as('freq');
      const counts = await db
        .select({ cardId: cardSightings.cardId, n: freq })
        .from(cardSightings)
        .groupBy(cardSightings.cardId)
        .all();
      const countMap = new Map(counts.map((c) => [c.cardId, c.n]));

      let withFreq: CardWithFreq[] = rows.map((c) => ({
        ...c,
        sightingCount: countMap.get(c.id) ?? 0,
      }));

      if (sort === 'frequency') {
        withFreq = withFreq.sort((a, b) => b.sightingCount - a.sightingCount);
      }
      return withFreq;
    },
    [sort, folderFilter],
  );
}

export function useCard(id: string | undefined): AsyncQueryResult<Card | null> {
  return useAsyncQuery<Card | null>(
    null,
    async () => {
      if (!id) return null;
      const rows = await db.select().from(cards).where(eq(cards.id, id)).limit(1).all();
      return rows[0] ?? null;
    },
    [id],
  );
}

export type FrequentNewCard = Card & { sightingCount: number };

export function useFrequencyRanking(limit: number = 5): AsyncQueryResult<FrequentNewCard[]> {
  return useAsyncQuery<FrequentNewCard[]>(
    [],
    async () => {
      const freq = sql<number>`COUNT(${cardSightings.id})`.as('freq');
      const rows = await db
        .select({ card: cards, freq })
        .from(cards)
        .leftJoin(cardSightings, eq(cardSightings.cardId, cards.id))
        .where(eq(cards.state, 0))
        .groupBy(cards.id)
        .orderBy(desc(freq), asc(cards.lemma))
        .limit(limit)
        .all();
      return rows
        .filter((r) => r.freq > 0)
        .map((r) => ({ ...r.card, sightingCount: r.freq }));
    },
    [limit],
  );
}

export function useCardSightings(
  cardId: string | undefined,
): AsyncQueryResult<{ photoId: string; surfaceForm: string; seenAt: number }[]> {
  return useAsyncQuery<{ photoId: string; surfaceForm: string; seenAt: number }[]>(
    [],
    async () => {
      if (!cardId) return [];
      return db
        .select({
          photoId: cardSightings.photoId,
          surfaceForm: cardSightings.surfaceForm,
          seenAt: cardSightings.seenAt,
        })
        .from(cardSightings)
        .where(eq(cardSightings.cardId, cardId))
        .orderBy(desc(cardSightings.seenAt))
        .all();
    },
    [cardId],
  );
}
