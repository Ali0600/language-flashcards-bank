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

export type OcrElement = {
  text: string;
  confidence: number;
};

export type OcrResult = {
  fullText: string;
  elements: OcrElement[];
  avgConfidence: number;
  source: 'mlkit' | 'gemini-vision';
};
