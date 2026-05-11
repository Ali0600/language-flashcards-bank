import { eq } from 'drizzle-orm';
import { Directory, File, Paths } from 'expo-file-system';
import uuid from 'react-native-uuid';

import { db } from '@/db/client';
import { cards, cardSightings, photos, type NewCard } from '@/db/schema';
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

  if (verdict.shouldUseLlm) {
    const visionResult = await analyzeImage(imageUri);
    analyzed = visionResult.words;
    rawText = visionResult.rawText;
    source = 'gemini-vision';
  } else {
    const surfaces = uniqueStrings(ocr.elements.map((e) => e.text));
    analyzed = await analyzeWords(surfaces);
    rawText = ocr.fullText;
    source = 'mlkit';
  }

  const filtered = analyzed.filter(shouldKeepWord);
  const deduped = dedupeByLemma(filtered);

  const permanentUri = persistPhoto(imageUri, photoId);

  await db.insert(photos).values({
    id: photoId,
    takenAt: now,
    imageUri: permanentUri,
    rawOcrText: rawText,
    ocrSource: source,
  });

  const results: ScanOutcome['results'] = [];

  for (const word of deduped) {
    const lemma = word.lemma.trim();
    if (!lemma) continue;

    const existing = await db.select().from(cards).where(eq(cards.lemma, lemma)).limit(1);
    let cardId: string;
    let isNew: boolean;

    if (existing.length > 0) {
      cardId = existing[0].id;
      isNew = false;
    } else {
      cardId = id();
      isNew = true;
      const initial = emptyState(new Date(now));
      const newCard: NewCard = {
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
      };
      await db.insert(cards).values(newCard);
    }

    await db.insert(cardSightings).values({
      id: id(),
      cardId,
      photoId,
      surfaceForm: word.surface,
      seenAt: now,
    });

    const sightingCount = await countSightings(cardId);
    results.push({ word, cardId, isNew, sightingsAfter: sightingCount });
  }

  return {
    photoId,
    source,
    ocrReason: verdict.reason,
    rawText,
    results,
  };
}

async function countSightings(cardId: string): Promise<number> {
  const rows = await db
    .select({ id: cardSightings.id })
    .from(cardSightings)
    .where(eq(cardSightings.cardId, cardId));
  return rows.length;
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
