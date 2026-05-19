/**
 * Written-mode grading. Pure (no native modules, no DB) so it lives in its
 * own file with a sibling test. Called by `components/study-written.tsx` after
 * the user types a German lemma in response to an English prompt.
 *
 * Design notes:
 *
 *   - **Lemma-only correctness.** We grade against the bare lemma, not
 *     "<article> <lemma>". Typing the article is OPTIONAL — the user can
 *     write "Tag" or "der Tag" and either passes. Typing the WRONG article
 *     ("das Tag" for a der-noun) is graded as wrong, because gender is the
 *     hard part of German vocab and the whole point of practice is to
 *     reinforce it. To accomplish that without false positives, we only
 *     strip the leading article when it matches the card's actual gender.
 *
 *   - **Case-insensitive.** German nouns are capitalized in their dictionary
 *     form, but expecting users to type the capital on a soft keyboard with
 *     autocorrect off is friction-heavy. We lowercase both sides.
 *
 *   - **Umlaut substitution.** Accept `ae`/`oe`/`ue`/`ss` as keyboard
 *     fallbacks for `ä`/`ö`/`ü`/`ß` (and vice versa). Both sides are
 *     normalized to the ASCII form before compare, so any combination
 *     matches. This is the standard German typing convention when an umlaut
 *     keyboard isn't available.
 *
 *   - **Whitespace.** Trim leading/trailing whitespace; collapse internal
 *     runs of whitespace to one space (so "der  Tag" matches "der Tag").
 */

const ARTICLES = ['der', 'die', 'das'] as const;
type Article = (typeof ARTICLES)[number];

/**
 * Normalize a German string for case-/umlaut-/whitespace-insensitive
 * comparison. NOT exported as the canonical form — only used inside the
 * grader. Exposed for testing.
 */
export function normalizeForGrading(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    // Order matters: ß → ss must run before any other replacement that
    // could leave a stray 's'. ä → ae etc. are independent.
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue');
}

/**
 * Strip a leading article from the normalized input IF it matches the
 * expected gender. Mismatched articles are deliberately left in place so
 * the comparison fails — see "Lemma-only correctness" in the file header.
 *
 * If `gender` is null (non-noun), no stripping happens — the user shouldn't
 * be typing an article in that case, and if they do it'll just fail the
 * compare.
 */
function stripLeadingArticleIfMatches(
  normalizedInput: string,
  gender: string | null,
): string {
  if (!gender) return normalizedInput;
  const g = gender.trim().toLowerCase();
  if (!ARTICLES.includes(g as Article)) return normalizedInput;
  const prefix = `${g} `;
  if (normalizedInput.startsWith(prefix)) {
    return normalizedInput.slice(prefix.length);
  }
  return normalizedInput;
}

export type GradeResult = {
  correct: boolean;
  /** What the user actually typed, trimmed for display (no other changes). */
  trimmedInput: string;
};

/**
 * Compare a user's typed answer to the expected lemma.
 *
 *   - `input`: raw TextInput value (will be trimmed + normalized).
 *   - `lemma`: the card's `lemma` column (just the word, no article).
 *   - `gender`: the card's `gender` column (`der`/`die`/`das`/null).
 *
 * Returns `{ correct, trimmedInput }`. `trimmedInput` is the user's input
 * with leading/trailing whitespace removed (preserves their casing + umlaut
 * choice for display) — the UI shows it back to them on a wrong answer
 * alongside the expected form.
 */
export function gradeWrittenAnswer(
  input: string,
  lemma: string,
  gender: string | null,
): GradeResult {
  const trimmedInput = input.trim();
  if (trimmedInput.length === 0) {
    return { correct: false, trimmedInput };
  }
  const normInput = normalizeForGrading(trimmedInput);
  const normLemma = normalizeForGrading(lemma);
  const stripped = stripLeadingArticleIfMatches(normInput, gender);
  return { correct: stripped === normLemma, trimmedInput };
}
