/**
 * Pure helpers for cloze-deletion review mode. Given a German example sentence
 * and a target lemma, hide the lemma so the learner has to recall it from
 * context.
 *
 * Word boundaries are Unicode-aware (`\p{L}`) so umlauts and ß match correctly
 * — JS's default `\b` is ASCII-only and would mis-split words like `über` or
 * `straße`. Matching is case-insensitive.
 *
 * If the lemma can't be located in the example (often because the example uses
 * an inflected form not present in the lemma), `matched` is false and the
 * caller should fall back to the non-cloze front.
 */
export const CLOZE_PLACEHOLDER = '____';

export function maskLemma(
  example: string | null | undefined,
  lemma: string | null | undefined,
): { masked: string; matched: boolean } {
  const text = example ?? '';
  const target = (lemma ?? '').trim();
  if (!text || !target) return { masked: text, matched: false };

  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let matched = false;
  try {
    const re = new RegExp(`(?<![\\p{L}])${escaped}(?![\\p{L}])`, 'gui');
    const masked = text.replace(re, () => {
      matched = true;
      return CLOZE_PLACEHOLDER;
    });
    return { masked, matched };
  } catch {
    // Hermes engines without lookbehind / Unicode property escapes — fall back.
    return { masked: text, matched: false };
  }
}
