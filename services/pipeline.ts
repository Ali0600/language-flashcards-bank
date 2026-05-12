import { inArray, sql } from 'drizzle-orm';
import { Directory, File, Paths } from 'expo-file-system';
import uuid from 'react-native-uuid';

import { db } from '@/db/client';
import { cards, cardSightings, photos, type NewCard, type NewCardSighting } from '@/db/schema';
import type { WordAnalysis } from '@/lib/types';
import { analyzeWords } from './analyze';
import { assessOcrQuality, recognizeText } from './ocr';
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
  source: 'mlkit' | 'gemini-vision';
  ocrReason: string;
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

  const ocr = await recognizeText(imageUri);
  const verdict = assessOcrQuality(ocr);

  let analyzed: WordAnalysis[];
  let rawText: string;
  let source: 'mlkit' | 'gemini-vision';
  let category: string | null = null;

  if (verdict.shouldUseLlm) {
    const visionResult = await analyzeImage(imageUri);
    analyzed = visionResult.words;
    rawText = visionResult.rawText;
    source = 'gemini-vision';
    category = visionResult.category;
  } else {
    const surfaces = uniqueStrings(ocr.elements.map((e) => e.text));
    analyzed = await analyzeWords(surfaces);
    rawText = ocr.fullText;
    source = 'mlkit';
  }

  const filtered = analyzed.filter(shouldKeepWord);
  const deduped = dedupeByLemma(filtered).filter((w) => w.lemma.trim().length > 0);

  const permanentUri = persistPhoto(imageUri, photoId);

  const wordPlan = await db.transaction(async (tx) => {
    await tx.insert(photos).values({
      id: photoId,
      takenAt: now,
      imageUri: permanentUri,
      rawOcrText: rawText,
      ocrSource: source,
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
    source,
    ocrReason: verdict.reason,
    rawText,
    results,
  };
}

function uniqueStrings(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const t = s.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
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
