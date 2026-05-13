import { shouldKeepWord } from '../stoplist';
import type { WordAnalysis } from '@/lib/types';

function makeWord(overrides: Partial<WordAnalysis>): WordAnalysis {
  return {
    surface: 'Wort',
    lemma: 'Wort',
    gender: null,
    pos: 'noun',
    translationEn: 'word',
    exampleDe: '',
    exampleEn: '',
    plural: null,
    bbox: null,
    ...overrides,
  };
}

describe('shouldKeepWord', () => {
  it('keeps content nouns', () => {
    expect(shouldKeepWord(makeWord({ lemma: 'Apfel', pos: 'noun' }))).toBe(true);
  });

  it('keeps verbs', () => {
    expect(shouldKeepWord(makeWord({ lemma: 'kaufen', pos: 'verb' }))).toBe(true);
  });

  it('keeps adjectives', () => {
    expect(shouldKeepWord(makeWord({ lemma: 'schnell', pos: 'adj' }))).toBe(true);
  });

  it.each([
    ['det', 'der'],
    ['pron', 'ich'],
    ['num', 'zwei'],
    ['propn', 'Berlin'],
    ['cconj', 'und'],
    ['sconj', 'weil'],
    ['part', 'zu'],
    ['aux', 'haben'],
    ['intj', 'oh'],
  ])('blocks pos=%s', (pos, lemma) => {
    expect(shouldKeepWord(makeWord({ lemma, pos }))).toBe(false);
  });

  it('blocks German function words even when pos looks fine', () => {
    expect(shouldKeepWord(makeWord({ lemma: 'der', pos: 'noun' }))).toBe(false);
    expect(shouldKeepWord(makeWord({ lemma: 'und', pos: 'noun' }))).toBe(false);
    expect(shouldKeepWord(makeWord({ lemma: 'nicht', pos: 'adv' }))).toBe(false);
  });

  it('is case-insensitive for the function-word check', () => {
    expect(shouldKeepWord(makeWord({ lemma: 'DER', pos: 'noun' }))).toBe(false);
    expect(shouldKeepWord(makeWord({ lemma: 'Und', pos: 'noun' }))).toBe(false);
  });

  it('blocks single-character lemmas', () => {
    expect(shouldKeepWord(makeWord({ lemma: 'a', pos: 'noun' }))).toBe(false);
  });

  it('blocks empty or whitespace-only lemmas', () => {
    expect(shouldKeepWord(makeWord({ lemma: '', pos: 'noun' }))).toBe(false);
    expect(shouldKeepWord(makeWord({ lemma: '   ', pos: 'noun' }))).toBe(false);
  });

  it('treats unknown pos as keep-eligible if lemma passes', () => {
    expect(shouldKeepWord(makeWord({ lemma: 'Brot', pos: 'unknown' }))).toBe(true);
  });
});
