import { useLocalSearchParams } from 'expo-router';

import { StudySession } from '@/components/study-session';
import { StudyWritten } from '@/components/study-written';
import { folderLabel } from '@/constants/folders';
import { useFolderDueCards } from '@/hooks/use-cards';

/**
 * Per-folder Study screen. Same UI as the global Study tab, but the queue is
 * scoped to cards with a sighting inside the given folder (and optionally
 * sub-category). Reverse siblings ride along by lemma, since sightings only
 * attach to forward cards.
 *
 * Reached from the Study mode picker (`<StudyModeModal>`) on
 * `app/folder/[slug].tsx`. Query params:
 *   - `?sub`  — mirrors the folder screen's filter:
 *       - missing       → no sub-cat filter (parent without sub-cats)
 *       - 'all'         → also no sub-cat filter (parent with sub-cats, all-mode)
 *       - 'null'        → photos with NULL `sub_category_id` within the parent
 *       - <id>          → specific sub-cat row id
 *   - `?mode` — study UX (defaults to flashcards):
 *       - missing / 'flashcards' → `<StudySession>` (flip + 4-way swipe-rate)
 *       - 'written'              → `<StudyWritten>` (type the German lemma)
 *       - 'multiple'             → not implemented yet (the picker shows it
 *                                  disabled, so this URL shouldn't occur in
 *                                  practice; we fall back to flashcards if
 *                                  someone hand-types it).
 *
 * Daily-new-cards quota is NOT applied here (per-folder study is a deliberate
 * focused-study action — every in-scope due card surfaces).
 */
export default function StudyFolderScreen() {
  const { slug, sub, mode } = useLocalSearchParams<{
    slug: string;
    sub?: string;
    mode?: string;
  }>();

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

  // Unknown / future values fall back to flashcards rather than rendering
  // a blank screen — defensive against typos and the placeholder 'multiple'
  // route until that mode is built.
  if (mode === 'written') {
    return (
      <StudyWritten
        loading={loading}
        error={error}
        dueCards={dueCards}
        refetch={refetch}
        emptyTitle="Nothing due here"
        emptyBody={`No cards from ${folderName} are due right now. Come back later or study from another folder.`}
      />
    );
  }

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
