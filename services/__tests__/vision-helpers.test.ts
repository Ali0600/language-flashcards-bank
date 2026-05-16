import { sanitizeArticle } from '../vision-helpers';

describe('sanitizeArticle', () => {
  it('keeps the article for a proper noun lemma', () => {
    expect(sanitizeArticle('noun', 'Tag', 'der')).toBe('der');
    expect(sanitizeArticle('noun', 'Frau', 'die')).toBe('die');
    expect(sanitizeArticle('noun', 'Haus', 'das')).toBe('das');
  });

  it('keeps the article on a proper noun (pos=propn) with capitalized lemma', () => {
    expect(sanitizeArticle('propn', 'Deutschland', 'das')).toBe('das');
  });

  it('keeps the article on a substantivized verb (capitalized lemma, pos=noun)', () => {
    // "das Gehen" — substantivized verb is a noun.
    expect(sanitizeArticle('noun', 'Gehen', 'das')).toBe('das');
  });

  it('strips the article from indefinite pronouns', () => {
    // The "das alles" bug — alles is a pronoun and the lemma is lowercase.
    expect(sanitizeArticle('pron', 'alles', 'das')).toBeNull();
    expect(sanitizeArticle('pron', 'nichts', 'das')).toBeNull();
    expect(sanitizeArticle('pron', 'etwas', 'das')).toBeNull();
    expect(sanitizeArticle('pron', 'viele', 'die')).toBeNull();
  });

  it('strips the article from adjectives', () => {
    expect(sanitizeArticle('adj', 'gut', 'das')).toBeNull();
    expect(sanitizeArticle('adj', 'schnell', 'der')).toBeNull();
  });

  it('strips the article from adverbs', () => {
    expect(sanitizeArticle('adv', 'hier', 'das')).toBeNull();
    expect(sanitizeArticle('adv', 'jetzt', 'die')).toBeNull();
  });

  it('strips the article from verb infinitives', () => {
    expect(sanitizeArticle('verb', 'gehen', 'das')).toBeNull();
    expect(sanitizeArticle('verb', 'sehen', 'das')).toBeNull();
  });

  it('strips the article when pos says noun but the lemma is lowercase (Gemini mistag)', () => {
    // The capitalization check overrides a wrong POS — even if Gemini says
    // it's a noun, a lowercase lemma can't be one in standard German.
    expect(sanitizeArticle('noun', 'alles', 'das')).toBeNull();
    expect(sanitizeArticle('noun', 'gut', 'der')).toBeNull();
  });

  it('returns null when gender is already null', () => {
    expect(sanitizeArticle('noun', 'Tag', null)).toBeNull();
    expect(sanitizeArticle('pron', 'alles', null)).toBeNull();
  });

  it('returns null for empty lemma', () => {
    expect(sanitizeArticle('noun', '', 'das')).toBeNull();
  });

  it('handles umlauts at the start of the lemma', () => {
    // "Ärger" is a real noun. Uppercase Ä → keep.
    expect(sanitizeArticle('noun', 'Ärger', 'der')).toBe('der');
    // "über" is a preposition. Lowercase ü → strip.
    expect(sanitizeArticle('prep', 'über', 'das')).toBeNull();
  });
});
