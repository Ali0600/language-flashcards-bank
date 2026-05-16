import { spokenLemma } from '../speech-helpers';

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
