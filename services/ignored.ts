import { desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/db/client';
import { ignoredWords, type IgnoredWord, type NewIgnoredWord } from '@/db/schema';

/**
 * Words the user has marked as "never show me again" from the Scan Results
 * screen. The pipeline checks this table before persisting cards/sightings.
 *
 * Case-insensitivity is enforced at the SQL layer via `COLLATE NOCASE` on
 * the lemma primary key (see migration 0007).
 */

export async function addLemmasToIgnoreList(lemmas: string[]): Promise<void> {
  const cleaned = Array.from(
    new Set(lemmas.map((l) => l.trim()).filter((l) => l.length > 0)),
  );
  if (cleaned.length === 0) return;

  const now = Date.now();
  const rows: NewIgnoredWord[] = cleaned.map((lemma) => ({ lemma, addedAt: now }));
  // `INSERT OR IGNORE` — if a lemma is already present (case-insensitive
  // primary key catches duplicates), skip it silently.
  await db.insert(ignoredWords).values(rows).onConflictDoNothing();
}

export async function removeLemmaFromIgnoreList(lemma: string): Promise<void> {
  await db.delete(ignoredWords).where(eq(ignoredWords.lemma, lemma));
}

export async function getIgnoreList(): Promise<IgnoredWord[]> {
  return db.select().from(ignoredWords).orderBy(desc(ignoredWords.addedAt)).all();
}

/**
 * Given a list of candidate lemmas, return only the ones NOT on the ignore
 * list. Used by the pipeline to drop ignored words before persistence.
 *
 * `COLLATE NOCASE` on the table means the `IN (...)` lookup is case-insensitive
 * for free — no need to lowercase the candidates client-side.
 */
export async function filterOutIgnored<T>(
  items: T[],
  lemmaOf: (item: T) => string,
): Promise<T[]> {
  if (items.length === 0) return items;
  const candidateLemmas = items.map(lemmaOf);
  const hits = await db
    .select({ lemma: ignoredWords.lemma })
    .from(ignoredWords)
    .where(inArray(ignoredWords.lemma, candidateLemmas))
    .all();
  if (hits.length === 0) return items;
  // SQLite returns the stored lemma in its original case — normalize both
  // sides to lowercase so the in-memory filter matches the SQL collation.
  const ignored = new Set(hits.map((h) => h.lemma.toLowerCase()));
  return items.filter((item) => !ignored.has(lemmaOf(item).toLowerCase()));
}

