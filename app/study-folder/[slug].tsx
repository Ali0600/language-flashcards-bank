import { useLocalSearchParams } from 'expo-router';

import { StudySession } from '@/components/study-session';
import { folderLabel } from '@/constants/folders';
import { useFolderDueCards } from '@/hooks/use-cards';

/**
 * Per-folder Study screen. Same UI as the global Study tab, but the queue is
 * scoped to cards with a sighting inside the given folder (and optionally
 * sub-category). Reverse siblings ride along by lemma, since sightings only
 * attach to forward cards.
 *
 * Reached from the Study button on `app/folder/[slug].tsx`. The `?sub` query
 * mirrors the folder screen's filter:
 *   - missing       → no sub-cat filter (parent without sub-cats)
 *   - 'all'         → also no sub-cat filter (parent with sub-cats, all-mode)
 *   - 'null'        → photos with NULL `sub_category_id` within the parent
 *   - <id>          → specific sub-cat row id
 *
 * Daily-new-cards quota stays global — introducing a new card from a folder
 * still counts against the same shared budget.
 */
export default function StudyFolderScreen() {
  const { slug, sub } = useLocalSearchParams<{ slug: string; sub?: string }>();

  // Translate the query param into the hook's `subId` argument:
  //   undefined → no sub filter
  //   null      → Uncategorized bucket
  //   string    → specific sub-cat id
  let subId: string | null | undefined;
  if (typeof sub !== 'string' || sub === 'all') subId = undefined;
  else if (sub === 'null') subId = null;
  else subId = sub;

  const { loading, data: dueCards, error, refetch } = useFolderDueCards(slug, subId);

  const folderName = folderLabel(slug);
  return (
    <StudySession
      loading={loading}
      error={error}
      dueCards={dueCards}
      refetch={refetch}
      emptyTitle="Nothing due here"
      emptyBody={`No cards from ${folderName} are due right now. Come back later or study from another folder.`}
    />
  );
}
