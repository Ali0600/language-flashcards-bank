import { useAsyncQuery } from '@/hooks/use-async-query';
import {
  getCardsForSubCategory,
  getCategoryTotals,
  getSubCategoriesFor,
  getSubCategorySummaries,
  type SubCategorySummary,
} from '@/services/subcategory';
import type { SubCategory } from '@/db/schema';

/** Flat list of sub-categories for a given parent (e.g. 'screenshots'). */
export function useSubCategoriesFor(parentSlug: string) {
  return useAsyncQuery<SubCategory[]>(
    [],
    () => getSubCategoriesFor(parentSlug),
    [parentSlug],
  );
}

/** Sub-cats + photo/card counts, plus an "Uncategorized" bucket when populated. */
export function useSubCategorySummaries(parentSlug: string) {
  return useAsyncQuery<SubCategorySummary[]>(
    [],
    () => getSubCategorySummaries(parentSlug),
    [parentSlug],
  );
}

/**
 * Deduplicated photo + card totals for the entire parent. Powers the "All"
 * tile shown at the top of the sub-cat grid when there's more than one
 * sub-cat (or sub-cat + Uncategorized).
 */
export function useCategoryTotals(parentSlug: string) {
  return useAsyncQuery<{ photoCount: number; cardCount: number }>(
    { photoCount: 0, cardCount: 0 },
    () => getCategoryTotals(parentSlug),
    [parentSlug],
  );
}

/**
 * Cards visible inside `/folder/[slug]?sub=<id>`. `subId` of `null` is the
 * "Uncategorized within this parent" bucket. Filters to forward-direction
 * cards so reverse siblings don't double-count, matching the Library queries.
 */
export function useSubCategoryCards(parentSlug: string, subId: string | null) {
  return useAsyncQuery(
    [],
    () => getCardsForSubCategory(parentSlug, subId),
    [parentSlug, subId],
  );
}
