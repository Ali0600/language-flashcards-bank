import { inArray, sql } from 'drizzle-orm';
import { Directory, File, Paths } from 'expo-file-system';
import uuid from 'react-native-uuid';

import { db } from '@/db/client';
import { cards, cardSightings, photos, type NewCard, type NewCardSighting } from '@/db/schema';
import type { WordAnalysis } from '@/lib/types';
import { emptyState } from './scheduler';
import { shouldKeepWord } from './stoplist';
import { analyzeImage } from './vision';

function id(): string {
  return uuid.v4() as string;
}

function persistPhoto(sourceUri: string, photoId: string): string {
  const photosDir = new Directory(Paths.document, 'photos');
  photosDir.create({ intermediates: true, idempotent: true });
  const ext = sourceUri.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const dest = new File(photosDir, `${photoId}.${ext}`);
  new File(sourceUri).copy(dest);
  return dest.uri;
}

export type ScanOutcome = {
  photoId: string;
  rawText: string;
  results: Array<{
    word: WordAnalysis;
    cardId: string;
    isNew: boolean;
    sightingsAfter: number;
  }>;
};

export async function processPhoto(imageUri: string): Promise<ScanOutcome> {
  const photoId = id();
  const now = Date.now();

  const visionResult = await analyzeImage(imageUri);
  const analyzed = visionResult.words;
  const rawText = visionResult.rawText;
  const category = visionResult.category;

  const filtered = analyzed.filter(shouldKeepWord);
  const deduped = dedupeByLemma(filtered).filter((w) => w.lemma.trim().length > 0);

  const permanentUri = persistPhoto(imageUri, photoId);

  const wordPlan = await db.transaction(async (tx) => {
    await tx.insert(photos).values({
      id: photoId,
      takenAt: now,
      imageUri: permanentUri,
      rawOcrText: rawText,
      category,
    });

    const lemmas = deduped.map((w) => w.lemma.trim());
    const existing =
      lemmas.length === 0
        ? []
        : await tx.select().from(cards).where(inArray(cards.lemma, lemmas)).all();
    const existingByLemma = new Map(existing.map((c) => [c.lemma, c.id]));

    const newCards: NewCard[] = [];
    const sightingsToInsert: NewCardSighting[] = [];
    const plan: Array<{ word: WordAnalysis; cardId: string; isNew: boolean }> = [];

    for (const word of deduped) {
      const lemma = word.lemma.trim();
      const existingId = existingByLemma.get(lemma);
      let cardId: string;
      let isNew: boolean;

      if (existingId) {
        cardId = existingId;
        isNew = false;
      } else {
        cardId = id();
        isNew = true;
        const initial = emptyState(new Date(now));
        newCards.push({
          id: cardId,
          lemma,
          gender: word.gender,
          pos: word.pos,
          translationEn: word.translationEn,
          exampleDe: word.exampleDe,
          exampleEn: word.exampleEn,
          plural: word.plural,
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
        existingByLemma.set(lemma, cardId);
      }

      sightingsToInsert.push({
        id: id(),
        cardId,
        photoId,
        surfaceForm: word.surface,
        seenAt: now,
      });
      plan.push({ word, cardId, isNew });
    }

    if (newCards.length > 0) {
      await tx.insert(cards).values(newCards);
    }
    if (sightingsToInsert.length > 0) {
      await tx.insert(cardSightings).values(sightingsToInsert);
    }

    return plan;
  });

  const cardIds = Array.from(new Set(wordPlan.map((p) => p.cardId)));
  const counts = new Map<string, number>();
  if (cardIds.length > 0) {
    const rows = await db
      .select({
        cardId: cardSightings.cardId,
        count: sql<number>`COUNT(*)`.as('sighting_count'),
      })
      .from(cardSightings)
      .where(inArray(cardSightings.cardId, cardIds))
      .groupBy(cardSightings.cardId)
      .all();
    for (const r of rows) counts.set(r.cardId, r.count);
  }

  const results: ScanOutcome['results'] = wordPlan.map((p) => ({
    word: p.word,
    cardId: p.cardId,
    isNew: p.isNew,
    sightingsAfter: counts.get(p.cardId) ?? 1,
  }));

  return {
    photoId,
    rawText,
    results,
  };
}

function dedupeByLemma(words: WordAnalysis[]): WordAnalysis[] {
  const seen = new Set<string>();
  const out: WordAnalysis[] = [];
  for (const w of words) {
    const key = w.lemma.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}
