import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card as FsrsCard,
} from 'ts-fsrs';

const scheduler = fsrs(generatorParameters());

export type FsrsState = {
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: number | null;
};

export function emptyState(now: Date = new Date()): FsrsState {
  return cardToState(createEmptyCard(now));
}

export function cardToState(c: FsrsCard): FsrsState {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsedDays: c.elapsed_days,
    scheduledDays: c.scheduled_days,
    learningSteps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    lastReview: c.last_review ? c.last_review.getTime() : null,
  };
}

export function stateToCard(s: FsrsState): FsrsCard {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsedDays,
    scheduled_days: s.scheduledDays,
    learning_steps: s.learningSteps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state as State,
    last_review: s.lastReview != null ? new Date(s.lastReview) : undefined,
  };
}

export type ReviewOutcome = {
  next: FsrsState;
  rating: Rating;
  reviewedAt: number;
  log: {
    state: number;
    stability: number;
    difficulty: number;
    elapsedDays: number;
    scheduledDays: number;
    dueBefore: number;
    dueAfter: number;
  };
};

export function review(
  prev: FsrsState,
  rating: Exclude<Rating, Rating.Manual>,
  now: Date = new Date(),
): ReviewOutcome {
  const card = stateToCard(prev);
  const result = scheduler.next(card, now, rating);
  const next = cardToState(result.card);
  return {
    next,
    rating,
    reviewedAt: now.getTime(),
    log: {
      state: result.log.state,
      stability: result.log.stability,
      difficulty: result.log.difficulty,
      elapsedDays: result.log.elapsed_days,
      scheduledDays: result.log.scheduled_days,
      dueBefore: prev.due,
      dueAfter: next.due,
    },
  };
}

export { Rating, State };
