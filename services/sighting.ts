import { count, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { cards, cardSightings } from '@/db/schema';

/**
 * Remove a single sighting (e.g. one captured-photo occurrence of a word).
 * If this was the card's only sighting, the card row is deleted too — a brand-
 * new card with no remaining evidence in any photo is just clutter.
 *
 * Wrapped in a transaction so a half-completed delete can't leave a card
 * pointing to a sighting that's already gone, or vice versa.
 */
export async function removeSighting(sightingId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ cardId: cardSightings.cardId })
      .from(cardSightings)
      .where(eq(cardSightings.id, sightingId))
      .limit(1)
      .all();
    const sighting = rows[0];
    if (!sighting) return; // already gone — idempotent

    await tx.delete(cardSightings).where(eq(cardSightings.id, sightingId));

    const remaining = await tx
      .select({ n: count() })
      .from(cardSightings)
      .where(eq(cardSightings.cardId, sighting.cardId))
      .all();
    const remainingCount = remaining[0]?.n ?? 0;
    if (remainingCount === 0) {
      await tx.delete(cards).where(eq(cards.id, sighting.cardId));
    }
  });
}
