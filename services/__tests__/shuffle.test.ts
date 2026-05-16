import { shuffleArray } from '../shuffle';

describe('shuffleArray', () => {
  it('returns a new array, not the same reference', () => {
    const input = [1, 2, 3];
    expect(shuffleArray(input)).not.toBe(input);
  });

  it('does not mutate the input', () => {
    const input = [1, 2, 3, 4, 5];
    const snapshot = [...input];
    shuffleArray(input);
    expect(input).toEqual(snapshot);
  });

  it('preserves every element (no loss, no duplication)', () => {
    const input = ['a', 'b', 'c', 'd', 'e', 'f'];
    const result = shuffleArray(input);
    expect(result.length).toBe(input.length);
    expect([...result].sort()).toEqual([...input].sort());
  });

  it('returns the same array shape for length 0', () => {
    expect(shuffleArray([])).toEqual([]);
  });

  it('returns the same single element for length 1', () => {
    expect(shuffleArray(['x'])).toEqual(['x']);
  });

  it('produces at least some non-identity orderings across many runs', () => {
    // Deterministically: the chance of Fisher-Yates returning identity for a
    // 10-element array across 100 trials is astronomically low (~1e-130).
    // If this fails, the shuffle is broken (e.g. always swaps with itself).
    const input = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    let nonIdentityCount = 0;
    for (let trial = 0; trial < 100; trial++) {
      const out = shuffleArray(input);
      if (out.some((v, i) => v !== input[i])) nonIdentityCount++;
    }
    expect(nonIdentityCount).toBeGreaterThan(95);
  });
});
