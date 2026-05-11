import { eq } from 'drizzle-orm';
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
  const rows = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1).all();
  if (rows.length === 0) throw new Error(`Card not found: ${cardId}`);

  const prev = dbCardToState(rows[0]);
  const outcome = review(prev, rating);

  await db
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

  await db.insert(reviewLogs).values({
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
}
