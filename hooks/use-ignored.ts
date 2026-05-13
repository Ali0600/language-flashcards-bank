import { getIgnoreList } from '@/services/ignored';
import { useAsyncQuery, type AsyncQueryResult } from '@/hooks/use-async-query';
import type { IgnoredWord } from '@/db/schema';

/**
 * Returns the full ignore list, sorted by newest first. Refetches on focus
 * via `useAsyncQuery` so the management screen stays in sync after removals.
 */
export function useIgnoredWords(): AsyncQueryResult<IgnoredWord[]> {
  return useAsyncQuery<IgnoredWord[]>([], () => getIgnoreList());
}
