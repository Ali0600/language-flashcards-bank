import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { asc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { cardSightings, cards, photos, type Photo } from '@/db/schema';

export type ScanRow = {
  sightingId: string;
  cardId: string;
  surfaceForm: string;
  lemma: string;
  gender: string | null;
  pos: string | null;
  translationEn: string | null;
  exampleDe: string | null;
  totalSightings: number;
};

export type ScanData = {
  loading: boolean;
  photo: Photo | null;
  rows: ScanRow[];
  error: Error | null;
};

export function useScan(photoId: string | undefined): ScanData {
  const [state, setState] = useState<ScanData>({
    loading: true,
    photo: null,
    rows: [],
    error: null,
  });

  useFocusEffect(
    useCallback(() => {
      if (!photoId) {
        setState({ loading: false, photo: null, rows: [], error: null });
        return;
      }
      let cancelled = false;
      (async () => {
        try {
          const photoRows = await db
            .select()
            .from(photos)
            .where(eq(photos.id, photoId))
            .limit(1)
            .all();
          const photo = photoRows[0] ?? null;

          const sightingRows = await db
            .select({
              sightingId: cardSightings.id,
              cardId: cardSightings.cardId,
              surfaceForm: cardSightings.surfaceForm,
              lemma: cards.lemma,
              gender: cards.gender,
              pos: cards.pos,
              translationEn: cards.translationEn,
              exampleDe: cards.exampleDe,
            })
            .from(cardSightings)
            .innerJoin(cards, eq(cardSightings.cardId, cards.id))
            .where(eq(cardSightings.photoId, photoId))
            .orderBy(asc(cardSightings.seenAt))
            .all();

          const cardIds = Array.from(new Set(sightingRows.map((s) => s.cardId)));
          const counts = new Map<string, number>();
          for (const cardId of cardIds) {
            const total = await db
              .select({ id: cardSightings.id })
              .from(cardSightings)
              .where(eq(cardSightings.cardId, cardId))
              .all();
            counts.set(cardId, total.length);
          }

          const rows: ScanRow[] = sightingRows.map((s) => ({
            ...s,
            totalSightings: counts.get(s.cardId) ?? 1,
          }));

          if (!cancelled) setState({ loading: false, photo, rows, error: null });
        } catch (e) {
          if (!cancelled)
            setState({ loading: false, photo: null, rows: [], error: e as Error });
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [photoId]),
  );

  return state;
}
