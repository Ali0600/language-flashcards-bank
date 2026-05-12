import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { cards, type Card } from '@/db/schema';

export type EditableCardFields = Pick<
  Card,
  'lemma' | 'gender' | 'pos' | 'translationEn' | 'exampleDe' | 'exampleEn' | 'plural' | 'notes'
>;

export async function updateCard(id: string, updates: Partial<EditableCardFields>): Promise<void> {
  await db
    .update(cards)
    .set({ ...updates, updatedAt: Date.now() })
    .where(eq(cards.id, id));
}

export async function deleteCard(id: string): Promise<void> {
  await db.delete(cards).where(eq(cards.id, id));
}
