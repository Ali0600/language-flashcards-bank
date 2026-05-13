import { and, eq, inArray } from 'drizzle-orm';
import uuid from 'react-native-uuid';

import { db } from '@/db/client';
import { cards, type Card, type NewCard } from '@/db/schema';
import type { CardDirection } from '@/lib/types';
import { emptyState } from './scheduler';

function id(): string {
  return uuid.v4() as string;
}

export type EditableCardFields = Pick<
  Card,
  'lemma' | 'gender' | 'pos' | 'translationEn' | 'exampleDe' | 'exampleEn' | 'plural' | 'notes'
>;

export async function updateCard(cardId: string, updates: Partial<EditableCardFields>): Promise<void> {
  await db
    .update(cards)
    .set({ ...updates, updatedAt: Date.now() })
    .where(eq(cards.id, cardId));
}

export async function deleteCard(cardId: string): Promise<void> {
  await db.delete(cards).where(eq(cards.id, cardId));
}

export function oppositeDirection(d: CardDirection): CardDirection {
  return d === 'de_to_en' ? 'en_to_de' : 'de_to_en';
}

/**
 * Build a new card row for the opposite direction, copying linguistic fields
 * from `source` but with a fresh id and empty FSRS state.
 */
function buildSibling(source: Card, now: number = Date.now()): NewCard {
  const initial = emptyState(new Date(now));
  return {
    id: id(),
    lemma: source.lemma,
    gender: source.gender,
    pos: source.pos,
    translationEn: source.translationEn,
    exampleDe: source.exampleDe,
    exampleEn: source.exampleEn,
    plural: source.plural,
    notes: source.notes,
    direction: oppositeDirection(source.direction),
    due: initial.due,
    stability: initial.stability,
    difficulty: initial.difficulty,
    elapsedDays: initial.elapsedDays,
    scheduledDays: initial.scheduledDays,
    learningSteps: initial.learningSteps,
    reps: initial.reps,
    lapses: initial.lapses,
    state: initial.state,
    lastReview: initial.lastReview,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Create a reverse sibling for a single card. No-op if a sibling already
 * exists (the compound unique index would also catch it, but we check first
 * to keep the error path quiet).
 */
export async function createReverseFor(cardId: string): Promise<{ created: boolean }> {
  const rows = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1).all();
  const source = rows[0];
  if (!source) return { created: false };
  const existing = await db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.lemma, source.lemma), eq(cards.direction, oppositeDirection(source.direction))))
    .limit(1)
    .all();
  if (existing.length > 0) return { created: false };
  await db.insert(cards).values(buildSibling(source));
  return { created: true };
}

/**
 * Insert reverse siblings for every forward (de_to_en) card that doesn't
 * already have one. Returns the number created. One transaction.
 */
export async function bulkCreateReverses(): Promise<number> {
  return db.transaction(async (tx) => {
    const forwards = await tx
      .select()
      .from(cards)
      .where(eq(cards.direction, 'de_to_en'))
      .all();
    if (forwards.length === 0) return 0;

    const lemmas = forwards.map((c) => c.lemma);
    const existingReverses = await tx
      .select({ lemma: cards.lemma })
      .from(cards)
      .where(and(eq(cards.direction, 'en_to_de'), inArray(cards.lemma, lemmas)))
      .all();
    const haveReverseFor = new Set(existingReverses.map((r) => r.lemma));

    const now = Date.now();
    const toInsert: NewCard[] = forwards
      .filter((c) => !haveReverseFor.has(c.lemma))
      .map((c) => buildSibling(c, now));
    if (toInsert.length === 0) return 0;
    await tx.insert(cards).values(toInsert);
    return toInsert.length;
  });
}

/**
 * Look up the sibling card (opposite direction, same lemma) for a given
 * card. Returns null if none exists.
 */
export async function findSibling(card: Card): Promise<Card | null> {
  const rows = await db
    .select()
    .from(cards)
    .where(and(eq(cards.lemma, card.lemma), eq(cards.direction, oppositeDirection(card.direction))))
    .limit(1)
    .all();
  return rows[0] ?? null;
}

