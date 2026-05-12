import { dedupeByLemma } from '../pipeline-helpers';
import type { WordAnalysis } from '@/lib/types';

function makeWord(overrides: Partial<WordAnalysis>): WordAnalysis {
  return {
    surface: overrides.lemma ?? 'X',
    lemma: 'X',
    gender: null,
    pos: 'noun',
    translationEn: '',
    exampleDe: '',
    exampleEn: '',
    plural: null,
    ...overrides,
  };
}

describe('dedupeByLemma', () => {
  it('returns the array unchanged when no duplicates exist', () => {
    const words = [
      makeWord({ lemma: 'Apfel' }),
      makeWord({ lemma: 'Brot' }),
      makeWord({ lemma: 'Wasser' }),
    ];
    expect(dedupeByLemma(words)).toEqual(words);
  });

  it('keeps only the first occurrence of duplicates', () => {
    const first = makeWord({ lemma: 'Apfel', surface: 'Apfel' });
    const dup = makeWord({ lemma: 'Apfel', surface: 'Äpfel' });
    expect(dedupeByLemma([first, dup])).toEqual([first]);
  });

  it('is case-insensitive', () => {
    const a = makeWord({ lemma: 'Apfel' });
    const b = makeWord({ lemma: 'APFEL' });
    expect(dedupeByLemma([a, b])).toEqual([a]);
  });

  it('trims whitespace when comparing', () => {
    const a = makeWord({ lemma: 'Apfel' });
    const b = makeWord({ lemma: '  Apfel  ' });
    expect(dedupeByLemma([a, b])).toEqual([a]);
  });

  it('skips empty or whitespace-only lemmas', () => {
    const empty = makeWord({ lemma: '' });
    const ws = makeWord({ lemma: '   ' });
    const real = makeWord({ lemma: 'Apfel' });
    expect(dedupeByLemma([empty, ws, real])).toEqual([real]);
  });

  it('preserves order of first-seen lemmas', () => {
    const result = dedupeByLemma([
      makeWord({ lemma: 'Brot' }),
      makeWord({ lemma: 'Apfel' }),
      makeWord({ lemma: 'brot' }),
      makeWord({ lemma: 'Wasser' }),
    ]);
    expect(result.map((w) => w.lemma)).toEqual(['Brot', 'Apfel', 'Wasser']);
  });
});
