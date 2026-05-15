import { and, eq, inArray, sql } from 'drizzle-orm';
import { Directory, File, Paths } from 'expo-file-system';
import uuid from 'react-native-uuid';

import { hasSubCategories } from '@/constants/folders';
import { db } from '@/db/client';
import { cards, cardSightings, photos, type NewCard, type NewCardSighting } from '@/db/schema';
import type { BBox, WordAnalysis } from '@/lib/types';
import { filterOutIgnored } from './ignored';
import { dedupeByLemma } from './pipeline-helpers';
import { emptyState } from './scheduler';
import { DEFAULT_SETTINGS, getSetting, SettingKeys } from './settings';
import { shouldKeepWord } from './stoplist';
import { findSubCategoryByName } from './subcategory';
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
  /**
   * Gemini's raw sub-category suggestion (e.g. "Instagram") when the photo
   * landed in a sub-cat-enabled parent (today: screenshots) and Gemini
   * supplied a non-empty `appName`. Echoed through so the scan-subcategory
   * picker can show a "Create new" tile without re-querying the model.
   * Null when not applicable.
   */
  subCategorySuggestion: string | null;
};

export async function processPhoto(
  imageUri: string,
  opts?: { focusRegion?: BBox | null },
): Promise<ScanOutcome> {
  const photoId = id();
  const now = Date.now();

  const visionResult = await analyzeImage(imageUri, { focusRegion: opts?.focusRegion ?? null });
  const analyzed = visionResult.words;
  const rawText = visionResult.rawText;
  const category = visionResult.category;
  const appName = visionResult.appName;

  const filtered = analyzed.filter(shouldKeepWord);
  const deduped = dedupeByLemma(filtered).filter((w) => w.lemma.trim().length > 0);
  // Drop any lemma the user has previously marked as ignored. Done after
  // dedup so we issue one IN(...) query against the candidate set.
  const kept = await filterOutIgnored(deduped, (w) => w.lemma);

  const permanentUri = persistPhoto(imageUri, photoId);

  // Read these before the tx so we don't keep an in-flight DB connection blocked.
  const autoReverse = await getSetting<boolean>(
    SettingKeys.autoCreateReverseCards,
    DEFAULT_SETTINGS.autoCreateReverseCards,
  );

  // If the photo landed in a sub-cat-enabled parent and Gemini named an app
  // we already have on file, pre-assign the photo to that sub-cat. The
  // suggestion is echoed through ScanOutcome regardless so the picker can
  // still offer a "Create new" tile when no match exists.
  let resolvedSubCategoryId: string | null = null;
  let subCategorySuggestion: string | null = null;
  if (category && hasSubCategories(category) && appName) {
    subCategorySuggestion = appName;
    const match = await findSubCategoryByName(category, appName).catch(() => null);
    if (match) resolvedSubCategoryId = match.id;
  }

  const wordPlan = await db.transaction(async (tx) => {
    await tx.insert(photos).values({
      id: photoId,
      takenAt: now,
      imageUri: permanentUri,
      rawOcrText: rawText,
      category,
      subCategoryId: resolvedSubCategoryId,
    });

    const lemmas = kept.map((w) => w.lemma.trim());
    // Match sightings to the FORWARD (de_to_en) card only — reverses don't
    // belong to a photo, they're derived. Lookup includes direction so we
    // don't accidentally pick up a reverse sibling for an existing word.
    const existing =
      lemmas.length === 0
        ? []
        : await tx
            .select()
            .from(cards)
            .where(and(inArray(cards.lemma, lemmas), eq(cards.direction, 'de_to_en')))
            .all();
    const existingByLemma = new Map(existing.map((c) => [c.lemma, c.id]));

    // Which lemmas already have a reverse sibling? Used to skip duplicate
    // inserts during auto-reverse creation.
    let lemmasWithReverse = new Set<string>();
    if (autoReverse && lemmas.length > 0) {
      const reverses = await tx
        .select({ lemma: cards.lemma })
        .from(cards)
        .where(and(inArray(cards.lemma, lemmas), eq(cards.direction, 'en_to_de')))
        .all();
      lemmasWithReverse = new Set(reverses.map((r) => r.lemma));
    }

    const newCards: NewCard[] = [];
    const sightingsToInsert: NewCardSighting[] = [];
    const plan: Array<{ word: WordAnalysis; cardId: string; isNew: boolean }> = [];

    for (const word of kept) {
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
          direction: 'de_to_en',
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

        // Auto-create the reverse sibling alongside the forward card so the
        // user starts with both directions queued.
        if (autoReverse && !lemmasWithReverse.has(lemma)) {
          const reverseInitial = emptyState(new Date(now));
          newCards.push({
            id: id(),
            lemma,
            gender: word.gender,
            pos: word.pos,
            translationEn: word.translationEn,
            exampleDe: word.exampleDe,
            exampleEn: word.exampleEn,
            plural: word.plural,
            direction: 'en_to_de',
            due: reverseInitial.due,
            stability: reverseInitial.stability,
            difficulty: reverseInitial.difficulty,
            elapsedDays: reverseInitial.elapsedDays,
            scheduledDays: reverseInitial.scheduledDays,
            learningSteps: reverseInitial.learningSteps,
            reps: reverseInitial.reps,
            lapses: reverseInitial.lapses,
            state: reverseInitial.state,
            lastReview: reverseInitial.lastReview,
            createdAt: now,
            updatedAt: now,
          });
          lemmasWithReverse.add(lemma);
        }
      }

      sightingsToInsert.push({
        id: id(),
        cardId,
        photoId,
        surfaceForm: word.surface,
        seenAt: now,
        bbox: word.bbox ? JSON.stringify(word.bbox) : null,
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
    subCategorySuggestion,
  };
}
