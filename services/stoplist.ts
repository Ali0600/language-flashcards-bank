import type { WordAnalysis } from '@/lib/types';

const POS_BLOCKED = new Set([
  'det',
  'pron',
  'num',
  'propn',
  'punct',
  'sym',
  'x',
  'cconj',
  'sconj',
  'part',
  'aux',
  'intj',
]);

const FUNCTION_WORDS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des',
  'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
  'und', 'oder', 'aber', 'doch', 'denn', 'sondern',
  'wenn', 'weil', 'dass', 'da', 'als', 'ob', 'obwohl',
  'sein', 'bin', 'bist', 'ist', 'sind', 'seid', 'war', 'waren', 'gewesen',
  'haben', 'habe', 'hast', 'hat', 'hatte', 'hatten', 'gehabt',
  'werden', 'wird', 'wurde', 'worden',
  'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr',
  'mich', 'dich', 'ihn', 'uns', 'euch', 'ihnen',
  'mein', 'dein', 'unser', 'euer',
  'in', 'an', 'auf', 'bei', 'mit', 'nach', 'von', 'zu', 'aus',
  'vor', 'über', 'unter', 'durch', 'für', 'gegen', 'ohne', 'um', 'bis',
  'nicht', 'kein', 'keine', 'nur', 'auch', 'noch', 'schon', 'sehr',
  'wie', 'was', 'wer', 'wo', 'wann', 'warum',
]);

export function shouldKeepWord(w: WordAnalysis): boolean {
  const pos = w.pos?.toLowerCase().trim() ?? '';
  if (POS_BLOCKED.has(pos)) return false;
  const lemma = w.lemma?.toLowerCase().trim();
  if (!lemma || lemma.length < 2) return false;
  if (FUNCTION_WORDS.has(lemma)) return false;
  return true;
}
