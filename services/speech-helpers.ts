/**
 * Pure helpers for speech playback. Kept separate from `services/speech.ts`
 * so they can be unit-tested without dragging in expo-speech / native
 * modules.
 */

/**
 * Build the text to feed to `speakGerman` for a flashcard lemma. For
 * nouns (gender is non-null), prefixes the article so the listener hears
 * "der Tag" rather than just "Tag" — the article encodes the gender,
 * which is the harder part of German vocabulary to memorize from the
 * orthography alone. For non-nouns (alles, schnell, gehen, etc.) returns
 * the lemma unchanged.
 */
export function spokenLemma(
  lemma: string,
  gender: 'der' | 'die' | 'das' | null | undefined,
): string {
  if (!gender) return lemma;
  return `${gender} ${lemma}`;
}
