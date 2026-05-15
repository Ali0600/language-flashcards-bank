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

/**
 * Folder-scoped due-cards query for `/study-folder/[slug]`.
 *
 * - `parentSlug` is required; `subId` may be:
 *     - `undefined` → no sub-cat filter (parent without sub-cats, or "All apps" mode)
 *     - `null`      → photos in this parent with `sub_category_id IS NULL` (Uncategorized bucket)
 *     - `string`    → a specific sub-cat row id
 *
 * Cards in scope: forward (`de_to_en`) cards with at least one sighting in a
 * matching photo, PLUS their reverse (`en_to_de`) siblings (matched by lemma
 * since sightings only attach to forwards).
 *
 * Daily-new-cards quota is intentionally GLOBAL — a card introduced from a
 * folder still counts against the same daily budget.
 */
export function useFolderDueCards(
  parentSlug: string,
  subId?: string | null,
): AsyncQueryResult<Card[]> {
  return useAsyncQuery<Card[]>(
    [],
    async () => {
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

      // Build the photo-side predicate once; reused by both the in-scope
      // forward-card lookup and the new-card frequency ranking.
      const subPredicate =
        subId === undefined
          ? undefined
          : subId === null
            ? isNull(photos.subCategoryId)
            : eq(photos.subCategoryId, subId);
      const photoWhere = subPredicate
        ? and(eq(photos.category, parentSlug), subPredicate)
        : eq(photos.category, parentSlug);

      // 1) Distinct forward cards with a sighting in matching photos.
      const fwdRows = await db
        .selectDistinct({ id: cards.id, lemma: cards.lemma })
        .from(cards)
        .innerJoin(cardSightings, eq(cardSightings.cardId, cards.id))
        .innerJoin(photos, eq(photos.id, cardSightings.photoId))
        .where(and(eq(cards.direction, 'de_to_en'), photoWhere))
        .all();

      if (fwdRows.length === 0) return [];

      const inScopeIds = new Set(fwdRows.map((r) => r.id));
      const lemmas = Array.from(new Set(fwdRows.map((r) => r.lemma)));

      // 2) Reverse siblings of those forwards (same lemma, opposite direction).
      const reverseRows = await db
        .select({ id: cards.id })
        .from(cards)
        .where(and(inArray(cards.lemma, lemmas), eq(cards.direction, 'en_to_de')))
        .all();
      for (const r of reverseRows) inScopeIds.add(r.id);

      const inScope = Array.from(inScopeIds);

      // 3) Non-new due cards within scope.
      const nonNew = await db
        .select()
        .from(cards)
        .where(and(inArray(cards.id, inScope), lte(cards.due, now), ne(cards.state, 0)))
        .orderBy(asc(cards.due))
        .all();

      // 4) New due cards within scope, ranked by FOLDER-LOCAL sighting count
      //    so the most-seen-in-this-folder words drip in first. Reverse cards
      //    have zero sightings (sightings only attach to forwards) and so
      //    naturally sort after their forward sibling.
      //
      //    We use chained LEFT JOINs (not a correlated subquery) because
      //    Drizzle's `sql\`${cards.id}\`` renders as the bare column name
      //    `"id"` rather than `"cards"."id"`, which SQLite coerces to a
      //    string literal in the subquery context — the correlation
      //    silently fails. Folding the photo predicate into the join
      //    keeps Drizzle in control of all identifier qualification.
      let newCards: Card[] = [];
      if (quota > 0) {
        const photoJoinPredicate = subPredicate
          ? and(
              eq(photos.id, cardSightings.photoId),
              eq(photos.category, parentSlug),
              subPredicate,
            )
          : and(eq(photos.id, cardSightings.photoId), eq(photos.category, parentSlug));
        // COUNT(photos.id) — counts only when both joins matched (sighting
        // exists AND its photo is in the targeted folder/sub-cat). Reverse
        // cards and forwards seen only in OTHER folders end up at 0.
        const folderFreq = sql<number>`COUNT(${photos.id})`.as('folder_freq');
        const ranked = await db
          .select({ card: cards, freq: folderFreq })
          .from(cards)
          .leftJoin(cardSightings, eq(cardSightings.cardId, cards.id))
          .leftJoin(photos, photoJoinPredicate)
          .where(and(inArray(cards.id, inScope), eq(cards.state, 0), lte(cards.due, now)))
          .groupBy(cards.id)
          .orderBy(desc(folderFreq), asc(cards.lemma))
          .limit(quota)
          .all();
        newCards = ranked.map((r) => r.card);
      }

      return [...nonNew, ...newCards];
    },
    [parentSlug, subId ?? '__none__'],
  );
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
      // Library only surfaces forward (de_to_en) cards; reverse siblings
      // appear via the Study queue and on the forward card's detail page.
      const baseQuery = db.select().from(cards);
      const directionFilter = eq(cards.direction, 'de_to_en');
      const rows = restrictedCardIds
        ? await baseQuery
            .where(and(directionFilter, inArray(cards.id, restrictedCardIds)))
            .orderBy(orderBy)
            .all()
        : await baseQuery.where(directionFilter).orderBy(orderBy).all();

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

export type CardWithSibling = { card: Card | null; sibling: Card | null };

/**
 * Fetch the card by id plus its opposite-direction sibling (same lemma).
 * `sibling` is null when no reverse exists yet.
 */
export function useCardWithSibling(id: string | undefined): AsyncQueryResult<CardWithSibling> {
  return useAsyncQuery<CardWithSibling>(
    { card: null, sibling: null },
    async () => {
      if (!id) return { card: null, sibling: null };
      const rows = await db.select().from(cards).where(eq(cards.id, id)).limit(1).all();
      const card = rows[0] ?? null;
      if (!card) return { card: null, sibling: null };
      const oppositeDir = card.direction === 'de_to_en' ? 'en_to_de' : 'de_to_en';
      const siblingRows = await db
        .select()
        .from(cards)
        .where(and(eq(cards.lemma, card.lemma), eq(cards.direction, oppositeDir)))
        .limit(1)
        .all();
      return { card, sibling: siblingRows[0] ?? null };
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
        .where(and(eq(cards.state, 0), eq(cards.direction, 'de_to_en')))
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

export type PhotoSighting = {
  sightingId: string;
  cardId: string;
  lemma: string;
  surfaceForm: string;
  bbox: string | null;
};

/**
 * Sightings within a single photo, with each card's lemma joined in. Used by
 * the photo viewer to render tappable bounding-box overlays.
 */
export function useSightingsForPhoto(
  photoId: string | undefined,
): AsyncQueryResult<PhotoSighting[]> {
  return useAsyncQuery<PhotoSighting[]>(
    [],
    async () => {
      if (!photoId) return [];
      return db
        .select({
          sightingId: cardSightings.id,
          cardId: cardSightings.cardId,
          lemma: cards.lemma,
          surfaceForm: cardSightings.surfaceForm,
          bbox: cardSightings.bbox,
        })
        .from(cardSightings)
        .innerJoin(cards, eq(cards.id, cardSightings.cardId))
        .where(eq(cardSightings.photoId, photoId))
        .all();
    },
    [photoId],
  );
}
