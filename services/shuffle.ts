/**
 * Pure Fisher-Yates shuffle. Returns a new array; does not mutate the input.
 * Lives in its own file (rather than inline in `study-session.tsx`) so it can
 * be unit-tested without dragging in op-sqlite / native modules.
 *
 * Used by the study queue when the `shuffleCards` setting is on so the
 * snapshot order is randomized instead of FSRS-due-ordered.
 */
export function shuffleArray<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // Both indices are in [0, out.length - 1] so the `!` is safe under
    // `noUncheckedIndexedAccess`.
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}
