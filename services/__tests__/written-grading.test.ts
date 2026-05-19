import { gradeWrittenAnswer, normalizeForGrading } from '../written-grading';

describe('normalizeForGrading', () => {
  it('lowercases', () => {
    expect(normalizeForGrading('Tag')).toBe('tag');
  });

  it('trims and collapses whitespace', () => {
    expect(normalizeForGrading('  der   Tag  ')).toBe('der tag');
  });

  it('converts ß to ss', () => {
    expect(normalizeForGrading('Straße')).toBe('strasse');
  });

  it('converts umlauts to ASCII digraphs', () => {
    expect(normalizeForGrading('schön')).toBe('schoen');
    expect(normalizeForGrading('müde')).toBe('muede');
    expect(normalizeForGrading('Ärger')).toBe('aerger');
  });
});

describe('gradeWrittenAnswer', () => {
  describe('exact and case-insensitive matches', () => {
    it('grades exact match correct', () => {
      expect(gradeWrittenAnswer('Tag', 'Tag', 'der').correct).toBe(true);
    });

    it('grades lowercase input correct (German nouns are capitalized but we accept)', () => {
      expect(gradeWrittenAnswer('tag', 'Tag', 'der').correct).toBe(true);
    });

    it('grades wrong answer as incorrect', () => {
      expect(gradeWrittenAnswer('Nacht', 'Tag', 'der').correct).toBe(false);
    });

    it('grades empty input as incorrect (no free passes)', () => {
      expect(gradeWrittenAnswer('', 'Tag', 'der').correct).toBe(false);
      expect(gradeWrittenAnswer('   ', 'Tag', 'der').correct).toBe(false);
    });

    it('returns trimmed input for display', () => {
      expect(gradeWrittenAnswer('  Tag  ', 'Tag', 'der').trimmedInput).toBe('Tag');
    });
  });

  describe('article handling', () => {
    it('accepts the lemma with the correct article prefix', () => {
      expect(gradeWrittenAnswer('der Tag', 'Tag', 'der').correct).toBe(true);
    });

    it('accepts the lemma without an article', () => {
      expect(gradeWrittenAnswer('Tag', 'Tag', 'der').correct).toBe(true);
    });

    it('rejects the lemma with the wrong article (gender is the hard part)', () => {
      expect(gradeWrittenAnswer('das Tag', 'Tag', 'der').correct).toBe(false);
      expect(gradeWrittenAnswer('die Tag', 'Tag', 'der').correct).toBe(false);
    });

    it('accepts die for feminine nouns', () => {
      expect(gradeWrittenAnswer('die Frau', 'Frau', 'die').correct).toBe(true);
      expect(gradeWrittenAnswer('der Frau', 'Frau', 'die').correct).toBe(false);
    });

    it('accepts das for neuter nouns', () => {
      expect(gradeWrittenAnswer('das Haus', 'Haus', 'das').correct).toBe(true);
      expect(gradeWrittenAnswer('die Haus', 'Haus', 'das').correct).toBe(false);
    });

    it('does not strip articles for non-nouns (gender null)', () => {
      // For a non-noun, typing an article is just wrong — the comparison
      // should fail because the article shouldn't be there.
      expect(gradeWrittenAnswer('der schnell', 'schnell', null).correct).toBe(false);
      expect(gradeWrittenAnswer('schnell', 'schnell', null).correct).toBe(true);
    });
  });

  describe('umlaut substitution', () => {
    it('accepts ae for ä', () => {
      expect(gradeWrittenAnswer('Aerger', 'Ärger', 'der').correct).toBe(true);
    });

    it('accepts oe for ö', () => {
      expect(gradeWrittenAnswer('schoen', 'schön', null).correct).toBe(true);
    });

    it('accepts ue for ü', () => {
      expect(gradeWrittenAnswer('muede', 'müde', null).correct).toBe(true);
    });

    it('accepts ss for ß', () => {
      expect(gradeWrittenAnswer('Strasse', 'Straße', 'die').correct).toBe(true);
    });

    it('accepts the proper umlaut typed back', () => {
      expect(gradeWrittenAnswer('Ärger', 'Ärger', 'der').correct).toBe(true);
    });

    it('differentiates words that only differ in umlaut presence', () => {
      // "schon" (already) vs "schön" (beautiful) — different words. Our
      // normalization is ONE-WAY (umlaut → ASCII digraph), not symmetric:
      // "schön" becomes "schoen" but "schon" stays "schon". So they fail
      // the compare, which is the correct outcome — typing the unrelated
      // word is a genuine mistake, not a keyboard fallback.
      expect(gradeWrittenAnswer('schon', 'schön', null).correct).toBe(false);
      // And the keyboard-fallback typed "schoen" DOES match "schön".
      expect(gradeWrittenAnswer('schoen', 'schön', null).correct).toBe(true);
    });
  });

  describe('whitespace', () => {
    it('trims leading and trailing whitespace', () => {
      expect(gradeWrittenAnswer('  Tag  ', 'Tag', 'der').correct).toBe(true);
    });

    it('collapses internal whitespace', () => {
      expect(gradeWrittenAnswer('der  Tag', 'Tag', 'der').correct).toBe(true);
    });
  });
});
