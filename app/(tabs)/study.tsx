import { StudySession } from '@/components/study-session';
import { useDueCards, useFrequencyRanking } from '@/hooks/use-cards';

/**
 * Global Study tab. Thin wrapper around `<StudySession>` — the reusable card
 * UI lives in `components/study-session.tsx` so it can also power per-folder
 * study (`app/study-folder/[slug].tsx`). The differences between the two are
 * limited to (a) which due-cards hook supplies the queue and (b) whether the
 * "Seen often" suggested rail is shown.
 */
export default function StudyScreen() {
  const { loading, data: dueCards, error, refetch } = useDueCards();
  const { data: suggested } = useFrequencyRanking(5);

  return (
    <StudySession
      loading={loading}
      error={error}
      dueCards={dueCards}
      refetch={refetch}
      suggested={suggested}
      emptyTitle="All caught up"
      emptyBody="No cards are due right now. Snap a photo of some German text to add new vocabulary."
    />
  );
}
