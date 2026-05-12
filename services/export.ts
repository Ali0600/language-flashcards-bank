import { File, Paths } from 'expo-file-system';
import { Share } from 'react-native';
import { sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { cardSightings, cards } from '@/db/schema';
import { buildCsv } from './csv';

export async function exportCardsToCsv(): Promise<{ shared: boolean }> {
  const freq = sql<number>`COUNT(${cardSightings.id})`.as('freq');
  const rows = await db
    .select({
      lemma: cards.lemma,
      gender: cards.gender,
      pos: cards.pos,
      translationEn: cards.translationEn,
      plural: cards.plural,
      exampleDe: cards.exampleDe,
      exampleEn: cards.exampleEn,
      state: cards.state,
      due: cards.due,
      reps: cards.reps,
      lapses: cards.lapses,
      createdAt: cards.createdAt,
      freq,
    })
    .from(cards)
    .leftJoin(cardSightings, sql`${cardSightings.cardId} = ${cards.id}`)
    .groupBy(cards.id)
    .orderBy(cards.lemma)
    .all();

  const csv = buildCsv(rows);
  const file = new File(Paths.cache, 'language-flashcards-export.csv');
  if (file.exists) file.delete();
  file.create();
  file.write(csv);

  const result = await Share.share({
    url: file.uri,
    title: 'Language Flashcards · Cards export',
  });
  return { shared: result.action === Share.sharedAction };
}
