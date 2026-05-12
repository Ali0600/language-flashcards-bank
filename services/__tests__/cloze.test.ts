import { CLOZE_PLACEHOLDER, maskLemma } from '../cloze';

describe('maskLemma', () => {
  it('hides the lemma when it appears as a whole word', () => {
    const { masked, matched } = maskLemma('Ich kaufe Brot.', 'Brot');
    expect(masked).toBe(`Ich kaufe ${CLOZE_PLACEHOLDER}.`);
    expect(matched).toBe(true);
  });

  it('is case-insensitive', () => {
    const { masked, matched } = maskLemma('brot ist lecker.', 'Brot');
    expect(masked).toBe(`${CLOZE_PLACEHOLDER} ist lecker.`);
    expect(matched).toBe(true);
  });

  it('respects Unicode word boundaries (umlauts)', () => {
    // `über` starts with non-ASCII, naive `\b` would mis-handle it.
    const { masked, matched } = maskLemma('Wir gehen über die Brücke.', 'über');
    expect(masked).toBe(`Wir gehen ${CLOZE_PLACEHOLDER} die Brücke.`);
    expect(matched).toBe(true);
  });

  it('does not match partial words', () => {
    // `Brot` should not match inside `Brötchen`.
    const { masked, matched } = maskLemma('Ich esse ein Brötchen.', 'Brot');
    expect(masked).toBe('Ich esse ein Brötchen.');
    expect(matched).toBe(false);
  });

  it('returns matched=false when example is empty', () => {
    const { masked, matched } = maskLemma('', 'Brot');
    expect(masked).toBe('');
    expect(matched).toBe(false);
  });

  it('returns matched=false when lemma is missing', () => {
    const { masked, matched } = maskLemma('Ich kaufe Brot.', '');
    expect(masked).toBe('Ich kaufe Brot.');
    expect(matched).toBe(false);
  });

  it('handles multiple occurrences', () => {
    const { masked, matched } = maskLemma('Brot, Brot, Brot!', 'Brot');
    expect(masked).toBe(`${CLOZE_PLACEHOLDER}, ${CLOZE_PLACEHOLDER}, ${CLOZE_PLACEHOLDER}!`);
    expect(matched).toBe(true);
  });

  it('returns matched=false when the lemma does not appear', () => {
    const { masked, matched } = maskLemma('Wie geht es dir?', 'Brot');
    expect(masked).toBe('Wie geht es dir?');
    expect(matched).toBe(false);
  });
});
