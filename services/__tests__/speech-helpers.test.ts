import { sortGermanVoices, spokenLemma, voiceTier } from '../speech-helpers';

describe('spokenLemma', () => {
  it('prefixes der for masculine nouns', () => {
    expect(spokenLemma('Tag', 'der')).toBe('der Tag');
  });

  it('prefixes die for feminine nouns', () => {
    expect(spokenLemma('Frau', 'die')).toBe('die Frau');
  });

  it('prefixes das for neuter nouns', () => {
    expect(spokenLemma('Haus', 'das')).toBe('das Haus');
  });

  it('returns the lemma alone for non-nouns (gender null)', () => {
    expect(spokenLemma('alles', null)).toBe('alles');
    expect(spokenLemma('schnell', null)).toBe('schnell');
    expect(spokenLemma('gehen', null)).toBe('gehen');
  });

  it('treats undefined gender the same as null', () => {
    expect(spokenLemma('alles', undefined)).toBe('alles');
  });

  it('handles lemmas with umlauts', () => {
    expect(spokenLemma('Ärger', 'der')).toBe('der Ärger');
    expect(spokenLemma('über', null)).toBe('über');
  });
});

describe('voiceTier', () => {
  it('classifies premium identifiers', () => {
    expect(voiceTier('com.apple.voice.premium.de-DE.Anna')).toBe('premium');
  });

  it('classifies enhanced identifiers', () => {
    expect(voiceTier('com.apple.voice.enhanced.de-DE.Markus')).toBe('enhanced');
  });

  it('classifies compact/legacy identifiers as default', () => {
    expect(voiceTier('com.apple.voice.compact.de-DE.Anna')).toBe('default');
    expect(voiceTier('com.apple.ttsbundle.Anna-compact')).toBe('default');
  });

  it('is case-insensitive', () => {
    expect(voiceTier('COM.APPLE.VOICE.PREMIUM.DE-DE.ANNA')).toBe('premium');
  });

  it('falls back to default for unknown shapes rather than guessing', () => {
    // Safe direction: never claim a tier the voice may not have.
    expect(voiceTier('')).toBe('default');
    expect(voiceTier('some.random.identifier')).toBe('default');
    // "premium" as a bare substring (no dot delimiters) must NOT match —
    // otherwise a voice merely *named* premium-something gets promoted.
    expect(voiceTier('com.apple.voice.de-DE.PremiumSounding')).toBe('default');
  });
});

describe('sortGermanVoices', () => {
  const compactAnna = { identifier: 'com.apple.voice.compact.de-DE.Anna', name: 'Anna' };
  const enhancedMarkus = { identifier: 'com.apple.voice.enhanced.de-DE.Markus', name: 'Markus' };
  const enhancedAnna = { identifier: 'com.apple.voice.enhanced.de-DE.Anna', name: 'Anna' };
  const premiumAnna = { identifier: 'com.apple.voice.premium.de-DE.Anna', name: 'Anna' };

  it('puts premium first, then enhanced, then default', () => {
    const sorted = sortGermanVoices([compactAnna, enhancedMarkus, premiumAnna]);
    expect(sorted.map((v) => v.identifier)).toEqual([
      premiumAnna.identifier,
      enhancedMarkus.identifier,
      compactAnna.identifier,
    ]);
  });

  it('sorts alphabetically by name within a tier', () => {
    const sorted = sortGermanVoices([enhancedMarkus, enhancedAnna]);
    expect(sorted.map((v) => v.name)).toEqual(['Anna', 'Markus']);
  });

  it('does not mutate the input array', () => {
    const input = [compactAnna, premiumAnna];
    const snapshot = [...input];
    sortGermanVoices(input);
    expect(input).toEqual(snapshot);
  });

  it('handles an empty list', () => {
    expect(sortGermanVoices([])).toEqual([]);
  });
});
