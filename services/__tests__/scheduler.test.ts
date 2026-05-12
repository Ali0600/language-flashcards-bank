import { cardToState, emptyState, Rating, review, stateToCard } from '../scheduler';

describe('emptyState', () => {
  it('produces a New-state card with zero reps and lapses', () => {
    const s = emptyState(new Date('2026-05-12T00:00:00Z'));
    expect(s.state).toBe(0);
    expect(s.reps).toBe(0);
    expect(s.lapses).toBe(0);
    expect(s.stability).toBe(0);
    expect(s.difficulty).toBe(0);
    expect(s.lastReview).toBeNull();
    expect(typeof s.due).toBe('number');
  });
});

describe('cardToState <-> stateToCard roundtrip', () => {
  it('preserves all fields', () => {
    const now = new Date('2026-05-12T12:00:00Z');
    const original = emptyState(now);
    const roundtripped = cardToState(stateToCard(original));
    expect(roundtripped).toEqual(original);
  });
});

describe('review', () => {
  const now = new Date('2026-05-12T12:00:00Z');

  it('increments reps and moves a New card out of state=0', () => {
    const start = emptyState(now);
    const outcome = review(start, Rating.Good, now);
    expect(outcome.next.reps).toBe(1);
    expect(outcome.next.state).not.toBe(0);
    expect(outcome.rating).toBe(Rating.Good);
    expect(outcome.reviewedAt).toBe(now.getTime());
  });

  it('produces a log with dueBefore and dueAfter bracketing the change', () => {
    const start = emptyState(now);
    const outcome = review(start, Rating.Easy, now);
    expect(outcome.log.dueBefore).toBe(start.due);
    expect(outcome.log.dueAfter).toBe(outcome.next.due);
  });

  it('treats Again differently from Easy (lapses path)', () => {
    const start = { ...emptyState(now), state: 2, stability: 5, difficulty: 5, reps: 3 };
    const again = review(start, Rating.Again, now);
    const easy = review(start, Rating.Easy, now);
    // Again should push due closer, Easy further (or at least different)
    expect(again.next.due).not.toBe(easy.next.due);
  });
});
