import { File, Paths } from 'expo-file-system';
import { Share } from 'react-native';
import { sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { cardSightings, cards } from '@/db/schema';

const HEADERS = [
  'lemma',
  'gender',
  'pos',
  'translation_en',
  'plural',
  'example_de',
  'example_en',
  'sighting_count',
  'state',
  'due',
  'reps',
  'lapses',
  'created_at',
] as const;

function csvEscape(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function stateLabel(state: number): string {
  return ['New', 'Learning', 'Review', 'Relearning'][state] ?? String(state);
}

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

  const lines: string[] = [HEADERS.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.lemma,
        r.gender ?? '',
        r.pos ?? '',
        r.translationEn ?? '',
        r.plural ?? '',
        r.exampleDe ?? '',
        r.exampleEn ?? '',
        r.freq,
        stateLabel(r.state),
        new Date(r.due).toISOString(),
        r.reps,
        r.lapses,
        new Date(r.createdAt).toISOString(),
      ]
        .map(csvEscape)
        .join(','),
    );
  }

  const csv = lines.join('\n');
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
