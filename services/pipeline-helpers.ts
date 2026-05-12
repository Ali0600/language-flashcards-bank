import type { WordAnalysis } from '@/lib/types';

export function dedupeByLemma(words: WordAnalysis[]): WordAnalysis[] {
  const seen = new Set<string>();
  const out: WordAnalysis[] = [];
  for (const w of words) {
    const key = w.lemma.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}
