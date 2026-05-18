import { and, count, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { cards, cardSightings, photos } from '@/db/schema';
import type { FolderSlug } from '@/constants/folders';

/**
 * Update the auto-categorized folder of a photo. Pass null to mark it as
 * uncategorized (e.g. revert a Gemini misclassification while leaving it
 * out of every named folder).
 */
export async function updatePhotoCategory(
  id: string,
  category: FolderSlug | null,
): Promise<void> {
  await db.update(photos).set({ category }).where(eq(photos.id, id));
}

/**
 * Discard a draft photo and everything it created in the pipeline. Called
 * when the user backs out of the scan-results screen WITHOUT tapping Next
 * — they shouldn't see frequency counts or new cards pollute their
 * library from a scan they walked away from.
 *
 * Cleanup order (single transaction):
 *   1. Remember which card IDs had a sighting in this photo (the
 *      "affected" set).
 *   2. Delete every sighting tied to this photo.
 *   3. For each affected card, count remaining sightings across ALL
 *      photos. If zero, the card is orphaned by this teardown: delete
 *      the row. If it was a forward (`de_to_en`), also delete its
 *      reverse sibling (same lemma, `en_to_de`) — auto-created reverses
 *      never accrue sightings on their own, so they'd be dangling
 *      orphans without the forward.
 *   4. Delete the photo row.
 *
 * Cards that had pre-existing sightings from OTHER photos are left
 * intact — re-scanning an image you already captured shouldn't blow
 * away the original card.
 *
 * Idempotent: if the photo / sightings / cards are already gone, the
 * DELETEs simply affect zero rows. Safe to call multiple times.
 */
export async function deleteDraftPhoto(photoId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const affected = await tx
      .selectDistinct({ cardId: cardSightings.cardId })
      .from(cardSightings)
      .where(eq(cardSightings.photoId, photoId))
      .all();

    await tx.delete(cardSightings).where(eq(cardSightings.photoId, photoId));

    for (const { cardId } of affected) {
      const remaining = await tx
        .select({ n: count() })
        .from(cardSightings)
        .where(eq(cardSightings.cardId, cardId))
        .all();
      if ((remaining[0]?.n ?? 0) > 0) continue;

      // Card is orphaned by this teardown. Capture its lemma + direction
      // before deletion so we can also clean up its reverse sibling.
      const cardRows = await tx
        .select({ lemma: cards.lemma, direction: cards.direction })
        .from(cards)
        .where(eq(cards.id, cardId))
        .limit(1)
        .all();
      const c = cardRows[0];

      await tx.delete(cards).where(eq(cards.id, cardId));

      if (c && c.direction === 'de_to_en') {
        await tx
          .delete(cards)
          .where(and(eq(cards.lemma, c.lemma), eq(cards.direction, 'en_to_de')));
      }
    }

    await tx.delete(photos).where(eq(photos.id, photoId));
  });
}
