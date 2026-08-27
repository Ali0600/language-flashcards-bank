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

/** Quality tiers an iOS voice identifier can encode, best first. */
export type VoiceTier = 'premium' | 'enhanced' | 'default';

/**
 * Minimal shape of an expo-speech `Voice`. Declared structurally rather than
 * imported from `expo-speech` so this file stays free of native imports and
 * remains unit-testable. Any real `Voice` satisfies it.
 */
export type VoiceLike = {
  identifier: string;
  name: string;
};

/**
 * Classify an iOS voice by its identifier.
 *
 * We deliberately do NOT use expo-speech's `quality` field: its `VoiceQuality`
 * enum only has `Default` and `Enhanced`, and the iOS native module maps
 * anything that isn't `.enhanced` to `"Default"` — so **Premium voices come
 * back labelled `"Default"`** and would sort below Enhanced ones. Apple's
 * identifiers do encode the tier (`com.apple.voice.premium.de-DE.Anna`,
 * `com.apple.voice.enhanced.de-DE.Anna`), so we read it from there instead.
 *
 * Unknown/odd identifiers fall through to 'default', which is the safe answer:
 * it never over-promises quality the voice may not have.
 */
export function voiceTier(identifier: string): VoiceTier {
  const id = identifier.toLowerCase();
  if (id.includes('.premium.')) return 'premium';
  if (id.includes('.enhanced.')) return 'enhanced';
  return 'default';
}

const TIER_ORDER: Record<VoiceTier, number> = {
  premium: 0,
  enhanced: 1,
  default: 2,
};

/**
 * Order voices best-tier-first, then alphabetically by name within a tier, so
 * the picker surfaces the voices actually worth using at the top. Does not
 * mutate the input. Callers pass an already-language-filtered list.
 */
export function sortGermanVoices<T extends VoiceLike>(voices: readonly T[]): T[] {
  return [...voices].sort((a, b) => {
    const tierDelta = TIER_ORDER[voiceTier(a.identifier)] - TIER_ORDER[voiceTier(b.identifier)];
    if (tierDelta !== 0) return tierDelta;
    return a.name.localeCompare(b.name);
  });
}
