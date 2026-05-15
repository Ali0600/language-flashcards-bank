import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import uuid from 'react-native-uuid';

import { db } from '@/db/client';
import {
  cardSightings,
  cards,
  photos,
  subCategories,
  type SubCategory,
} from '@/db/schema';

/**
 * Sub-categories are a per-parent second-dimension classification. Today only
 * `parent_slug='screenshots'` is exercised — its sub-cats are app names like
 * "Instagram", "Twitter". Adding another parent to
 * `FOLDERS_WITH_SUBCATEGORIES` (see `constants/folders.ts`) wires it up
 * automatically; no changes here.
 *
 * Case-insensitivity is enforced at the SQL layer via the
 * `sub_categories_parent_name_nocase` unique index (`(parent_slug, name COLLATE
 * NOCASE)`, hand-edited into migration 0008 — Drizzle's `text()` doesn't emit
 * collation).
 */

function id(): string {
  return uuid.v4() as string;
}

export async function getSubCategoriesFor(parentSlug: string): Promise<SubCategory[]> {
  return db
    .select()
    .from(subCategories)
    .where(eq(subCategories.parentSlug, parentSlug))
    .orderBy(asc(subCategories.name))
    .all();
}

/**
 * Exact case-insensitive lookup. Used by the pipeline to auto-match Gemini's
 * `appName` hint against existing sub-cats. `name` is trimmed before the
 * lookup so "  Instagram " and "Instagram" match.
 */
export async function findSubCategoryByName(
  parentSlug: string,
  name: string,
): Promise<SubCategory | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const rows = await db
    .select()
    .from(subCategories)
    .where(
      and(
        eq(subCategories.parentSlug, parentSlug),
        // The unique index uses COLLATE NOCASE, but the `eq` operator does a
        // binary compare — explicit lower() on both sides makes the match work
        // without relying on the index's collation alone.
        sql`lower(${subCategories.name}) = lower(${trimmed})`,
      ),
    )
    .limit(1)
    .all();
  return rows[0] ?? null;
}

/**
 * Create a sub-category if it doesn't already exist (case-insensitive) and
 * return its id. Safe to call repeatedly with the same name.
 */
export async function createSubCategory(parentSlug: string, name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Sub-category name cannot be empty.');

  const existing = await findSubCategoryByName(parentSlug, trimmed);
  if (existing) return existing.id;

  const newId = id();
  await db
    .insert(subCategories)
    .values({
      id: newId,
      parentSlug,
      name: trimmed,
      createdAt: Date.now(),
    })
    .onConflictDoNothing();

  // Race-safe: if another insert won the unique-index race, re-query so we
  // return whatever id actually got persisted.
  const settled = await findSubCategoryByName(parentSlug, trimmed);
  return settled?.id ?? newId;
}

export async function setPhotoSubCategory(
  photoId: string,
  subCategoryId: string | null,
): Promise<void> {
  await db
    .update(photos)
    .set({ subCategoryId })
    .where(eq(photos.id, photoId));
}

/**
 * Wipe a sub-category. Photos pointing at it have `sub_category_id` nulled
 * (they remain in the parent category, just without an app tag). Wrapped in
 * one transaction so a partial failure can't leave dangling references.
 */
export async function deleteSubCategory(subCategoryId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(photos)
      .set({ subCategoryId: null })
      .where(eq(photos.subCategoryId, subCategoryId));
    await tx.delete(subCategories).where(eq(subCategories.id, subCategoryId));
  });
}

export type SubCategorySummary = {
  /** Sub-category row, or null for the "no sub-category set" bucket. */
  subCategory: SubCategory | null;
  /** Number of photos in this parent currently pointing at this sub-cat. */
  photoCount: number;
  /** Distinct cards seen across those photos (forward direction only). */
  cardCount: number;
};

/**
 * Per-sub-category roll-up for the Library > Folders drill-down. Includes a
 * synthetic "Uncategorized" entry (subCategory: null) when any photos in the
 * parent have a null `sub_category_id`. Sub-cats with no photos still appear
 * — the user may have created them intentionally.
 */
export async function getSubCategorySummaries(parentSlug: string): Promise<SubCategorySummary[]> {
  // 1) Pull every defined sub-cat for this parent. These ALWAYS appear in
  //    the result, even with zero photos.
  const subCats = await getSubCategoriesFor(parentSlug);

  // 2) Photo counts per sub_category_id (and NULL) within this parent.
  const photoRows = await db
    .select({
      subId: photos.subCategoryId,
      n: count(),
    })
    .from(photos)
    .where(eq(photos.category, parentSlug))
    .groupBy(photos.subCategoryId)
    .all();
  const photoCounts = new Map<string | null, number>();
  for (const r of photoRows) photoCounts.set(r.subId, r.n);

  // 3) Distinct forward-direction card counts per sub_category_id (and NULL).
  //    Done as one grouped query joined through sightings → photos.
  const cardRows = await db
    .select({
      subId: photos.subCategoryId,
      n: sql<number>`COUNT(DISTINCT ${cards.id})`,
    })
    .from(cards)
    .innerJoin(cardSightings, eq(cardSightings.cardId, cards.id))
    .innerJoin(photos, eq(photos.id, cardSightings.photoId))
    .where(and(eq(photos.category, parentSlug), eq(cards.direction, 'de_to_en')))
    .groupBy(photos.subCategoryId)
    .all();
  const cardCounts = new Map<string | null, number>();
  for (const r of cardRows) cardCounts.set(r.subId, r.n);

  const summaries: SubCategorySummary[] = subCats.map((sc) => ({
    subCategory: sc,
    photoCount: photoCounts.get(sc.id) ?? 0,
    cardCount: cardCounts.get(sc.id) ?? 0,
  }));

  // 4) Append the "Uncategorized within this parent" bucket if it has anything.
  const uncatPhotos = photoCounts.get(null) ?? 0;
  const uncatCards = cardCounts.get(null) ?? 0;
  if (uncatPhotos > 0 || uncatCards > 0) {
    summaries.push({
      subCategory: null,
      photoCount: uncatPhotos,
      cardCount: uncatCards,
    });
  }
  return summaries;
}

/**
 * Deduplicated totals across an entire parent category (regardless of
 * sub-category). Used by the "All" tile at the top of the sub-cat grid so the
 * count is the same number the user sees after tapping in — summing the
 * per-sub-cat card counts would double-count cards that appear under multiple
 * sub-cats.
 */
export async function getCategoryTotals(
  parentSlug: string,
): Promise<{ photoCount: number; cardCount: number }> {
  const photoRows = await db
    .select({ n: count() })
    .from(photos)
    .where(eq(photos.category, parentSlug))
    .all();
  const cardRows = await db
    .select({ n: sql<number>`COUNT(DISTINCT ${cards.id})` })
    .from(cards)
    .innerJoin(cardSightings, eq(cardSightings.cardId, cards.id))
    .innerJoin(photos, eq(photos.id, cardSightings.photoId))
    .where(and(eq(photos.category, parentSlug), eq(cards.direction, 'de_to_en')))
    .all();
  return {
    photoCount: photoRows[0]?.n ?? 0,
    cardCount: cardRows[0]?.n ?? 0,
  };
}

/**
 * Cards seen in photos under (parentSlug, subId) — for the
 * `/folder/[slug]?sub=...` drill-down. `subId === null` selects the
 * "Uncategorized within this parent" bucket.
 */
export async function getCardsForSubCategory(parentSlug: string, subId: string | null) {
  const subPredicate =
    subId === null ? isNull(photos.subCategoryId) : eq(photos.subCategoryId, subId);
  return db
    .selectDistinct({
      id: cards.id,
      lemma: cards.lemma,
      gender: cards.gender,
      pos: cards.pos,
      translationEn: cards.translationEn,
      exampleDe: cards.exampleDe,
      exampleEn: cards.exampleEn,
      plural: cards.plural,
      notes: cards.notes,
      direction: cards.direction,
      due: cards.due,
      state: cards.state,
      lastReview: cards.lastReview,
      createdAt: cards.createdAt,
    })
    .from(cards)
    .innerJoin(cardSightings, eq(cardSightings.cardId, cards.id))
    .innerJoin(photos, eq(photos.id, cardSightings.photoId))
    .where(
      and(
        eq(cards.direction, 'de_to_en'),
        eq(photos.category, parentSlug),
        subPredicate,
      ),
    )
    .orderBy(asc(cards.lemma))
    .all();
}
