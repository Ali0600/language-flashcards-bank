/**
 * Pure helpers for vision-result post-processing. Kept separate from
 * `services/vision.ts` so they can be unit-tested without dragging in
 * expo-image-manipulator / the Google GenAI SDK.
 */

export type Gender = 'der' | 'die' | 'das' | null;

/**
 * Strip the article from non-nouns. In standard German, only nouns
 * (`pos="noun"` or `pos="propn"` for proper nouns) take `der` / `die` / `das`.
 * Indefinite pronouns ("alles"), adjectives ("gut"), adverbs ("hier"), and
 * verb infinitives ("gehen") never take an article — Gemini occasionally
 * stamps "das alles" anyway despite the prompt's explicit rule, so this is
 * the belt-and-suspenders.
 *
 * Two checks, returning `null` if either fails:
 *   1. POS must be `noun` or `propn`.
 *   2. The lemma must start with an uppercase character (in German, all
 *      nouns are capitalized in their dictionary form; a lowercase lemma
 *      cannot be a noun, regardless of what POS Gemini reported).
 *
 * The capitalization check is the more reliable signal — Gemini sometimes
 * mistags a pronoun as a noun, and the capitalization heuristic catches
 * that even when POS is wrong.
 */
export function sanitizeArticle(pos: string, lemma: string, gender: Gender): Gender {
  if (!gender) return null;
  if (pos !== 'noun' && pos !== 'propn') return null;
  const first = lemma.charAt(0);
  if (first.length === 0) return null;
  if (first.toLowerCase() === first) return null;
  return gender;
}
