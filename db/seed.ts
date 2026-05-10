import uuid from 'react-native-uuid';

import { db } from './client';
import { cards } from './schema';
import { emptyState } from '@/services/scheduler';

const SEED_CARDS = [
  {
    lemma: 'Apfel',
    gender: 'der' as const,
    pos: 'noun',
    translationEn: 'apple',
    exampleDe: 'Ich esse einen Apfel zum Frühstück.',
    exampleEn: 'I eat an apple for breakfast.',
    plural: 'Äpfel',
  },
  {
    lemma: 'Milch',
    gender: 'die' as const,
    pos: 'noun',
    translationEn: 'milk',
    exampleDe: 'Die Milch ist im Kühlschrank.',
    exampleEn: 'The milk is in the fridge.',
    plural: null,
  },
  {
    lemma: 'Brot',
    gender: 'das' as const,
    pos: 'noun',
    translationEn: 'bread',
    exampleDe: 'Wir kaufen frisches Brot beim Bäcker.',
    exampleEn: 'We buy fresh bread at the bakery.',
    plural: 'Brote',
  },
  {
    lemma: 'Zucker',
    gender: 'der' as const,
    pos: 'noun',
    translationEn: 'sugar',
    exampleDe: 'Möchtest du Zucker im Kaffee?',
    exampleEn: 'Would you like sugar in your coffee?',
    plural: null,
  },
  {
    lemma: 'kaufen',
    gender: null,
    pos: 'verb',
    translationEn: 'to buy',
    exampleDe: 'Ich möchte einen Apfel kaufen.',
    exampleEn: 'I want to buy an apple.',
    plural: null,
  },
];

export async function seedIfEmpty(): Promise<void> {
  const existing = await db.select({ id: cards.id }).from(cards).limit(1);
  if (existing.length > 0) return;

  const now = Date.now();
  for (const c of SEED_CARDS) {
    const initial = emptyState(new Date(now));
    await db.insert(cards).values({
      id: uuid.v4() as string,
      lemma: c.lemma,
      gender: c.gender,
      pos: c.pos,
      translationEn: c.translationEn,
      exampleDe: c.exampleDe,
      exampleEn: c.exampleEn,
      plural: c.plural,
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
    });
  }
}
