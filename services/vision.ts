import { File } from 'expo-file-system';
import { GoogleGenAI, Type } from '@google/genai';

import { assertGeminiKey } from '@/lib/env';
import type { WordAnalysis } from '@/lib/types';

const MODEL = 'gemini-2.5-flash';

const wordSchema = {
  type: Type.OBJECT,
  properties: {
    surface: { type: Type.STRING },
    lemma: { type: Type.STRING },
    gender: { type: Type.STRING, enum: ['der', 'die', 'das', 'none'] },
    pos: { type: Type.STRING },
    translationEn: { type: Type.STRING },
    exampleDe: { type: Type.STRING },
    exampleEn: { type: Type.STRING },
    plural: { type: Type.STRING },
  },
  required: ['surface', 'lemma', 'gender', 'pos', 'translationEn', 'exampleDe', 'exampleEn'],
};

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    rawText: { type: Type.STRING },
    words: { type: Type.ARRAY, items: wordSchema },
  },
  required: ['rawText', 'words'],
};

const SYSTEM_PROMPT = `You are a German vocabulary extractor for a language-learning app.
Given an image (food packaging, a poster, a sign, a household label), do TWO things:
1. Transcribe all visible German text into "rawText".
2. Extract every distinct content word into "words" with linguistic analysis.

Rules for words:
- "surface" is the form as it appears in the image.
- "lemma" is the dictionary form (verbs infinitive, nouns nominative singular).
- "gender" for nouns: "der" / "die" / "das". For non-nouns: "none".
- "pos": noun, verb, adj, adv, prep, conj, intj, propn, num.
- Skip determiners/articles/pronouns/numerals/punctuation.
- Brand names: include but mark pos="propn".
- Skip duplicates (same lemma).
- "exampleDe" / "exampleEn": short natural sentence demonstrating use.
- "plural" for nouns only; empty string otherwise.`;

function normalizeGender(g: string): WordAnalysis['gender'] {
  if (g === 'der' || g === 'die' || g === 'das') return g;
  return null;
}

export type VisionResult = {
  rawText: string;
  words: WordAnalysis[];
};

export async function analyzeImage(imageUri: string): Promise<VisionResult> {
  const apiKey = assertGeminiKey();
  const ai = new GoogleGenAI({ apiKey });

  const base64 = await new File(imageUri).base64();

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64 } },
          { text: 'Transcribe and extract German vocabulary from this image.' },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema,
      temperature: 0.2,
    },
  });

  const text = response.text;
  if (!text) return { rawText: '', words: [] };

  const parsed = JSON.parse(text) as {
    rawText: string;
    words: Array<{
      surface: string;
      lemma: string;
      gender: string;
      pos: string;
      translationEn: string;
      exampleDe: string;
      exampleEn: string;
      plural?: string;
    }>;
  };

  return {
    rawText: parsed.rawText,
    words: parsed.words.map((p) => ({
      surface: p.surface,
      lemma: p.lemma,
      gender: normalizeGender(p.gender),
      pos: p.pos.toLowerCase(),
      translationEn: p.translationEn,
      exampleDe: p.exampleDe,
      exampleEn: p.exampleEn,
      plural: p.plural && p.plural.length > 0 ? p.plural : null,
    })),
  };
}
