import { desc, eq } from 'drizzle-orm';
import uuid from 'react-native-uuid';

import { db } from '@/db/client';
import { cards, reviewLogs } from '@/db/schema';
import { Rating, review, type FsrsState } from './scheduler';

export type ReviewRating = Exclude<Rating, Rating.Manual>;

function dbCardToState(c: typeof cards.$inferSelect): FsrsState {
  return {
    due: c.due,
    stability: c.stability,
    difficulty: c.difficulty,
    elapsedDays: c.elapsedDays,
    scheduledDays: c.scheduledDays,
    learningSteps: c.learningSteps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    lastReview: c.lastReview,
  };
}

export async function rateCard(cardId: string, rating: ReviewRating): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(cards).where(eq(cards.id, cardId)).limit(1).all();
    const row = rows[0];
    if (!row) throw new Error(`Card not found: ${cardId}`);

    const prev = dbCardToState(row);
    const outcome = review(prev, rating);

    await tx
      .update(cards)
      .set({
        due: outcome.next.due,
        stability: outcome.next.stability,
        difficulty: outcome.next.difficulty,
        elapsedDays: outcome.next.elapsedDays,
        scheduledDays: outcome.next.scheduledDays,
        learningSteps: outcome.next.learningSteps,
        reps: outcome.next.reps,
        lapses: outcome.next.lapses,
        state: outcome.next.state,
        lastReview: outcome.next.lastReview,
        updatedAt: outcome.reviewedAt,
      })
      .where(eq(cards.id, cardId));

    await tx.insert(reviewLogs).values({
      id: uuid.v4() as string,
      cardId,
      rating,
      reviewedAt: outcome.reviewedAt,
      state: outcome.log.state,
      dueBefore: outcome.log.dueBefore,
      dueAfter: outcome.log.dueAfter,
      stability: outcome.log.stability,
      difficulty: outcome.log.difficulty,
      elapsedDays: outcome.log.elapsedDays,
      scheduledDays: outcome.log.scheduledDays,
    });
  });
}

/**
 * Undo the most recent review for a card.
 *
 * `preRateCard` is the card row as it was BEFORE the rate that's being
 * undone — the StudySession captures this from its in-memory queue, which
 * is snapshotted once and not mutated when ratings happen (the DB is the
 * only thing that changes mid-session). So we can just blindly write its
 * FSRS columns back to the DB to restore the pre-rate schedule.
 *
 * Then we delete the most recent review_log row for that card. We pick
 * "most recent by reviewedAt" rather than tracking exact log IDs — keeps
 * the API simple, and rate-then-undo within the same session can't beat
 * the millisecond resolution of the timestamp.
 *
 * Wrapped in a single `db.transaction` so an interrupted undo doesn't
 * leave the card with a restored schedule but its review log still
 * present (which would double-count it in the Stats heatmap).
 */
export async function undoLatestReview(
  preRateCard: typeof cards.$inferSelect,
): Promise<void> {
  const prevState = dbCardToState(preRateCard);
  await db.transaction(async (tx) => {
    await tx
      .update(cards)
      .set({
        due: prevState.due,
        stability: prevState.stability,
        difficulty: prevState.difficulty,
        elapsedDays: prevState.elapsedDays,
        scheduledDays: prevState.scheduledDays,
        learningSteps: prevState.learningSteps,
        reps: prevState.reps,
        lapses: prevState.lapses,
        state: prevState.state,
        lastReview: prevState.lastReview,
        updatedAt: Date.now(),
      })
      .where(eq(cards.id, preRateCard.id));
    const latest = await tx
      .select({ id: reviewLogs.id })
      .from(reviewLogs)
      .where(eq(reviewLogs.cardId, preRateCard.id))
      .orderBy(desc(reviewLogs.reviewedAt))
      .limit(1)
      .all();
    const logId = latest[0]?.id;
    if (logId) {
      await tx.delete(reviewLogs).where(eq(reviewLogs.id, logId));
    }
  });
}
