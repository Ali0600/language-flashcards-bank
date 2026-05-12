export type Gender = 'der' | 'die' | 'das';

export type WordAnalysis = {
  surface: string;
  lemma: string;
  gender: Gender | null;
  pos: string;
  translationEn: string;
  exampleDe: string;
  exampleEn: string;
  plural: string | null;
};
