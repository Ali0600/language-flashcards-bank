import { GoogleGenAI, Type } from '@google/genai';

import { assertGeminiKey } from '@/lib/env';
import type { WordAnalysis } from '@/lib/types';

const MODEL = 'gemini-2.5-flash';

const wordSchema = {
  type: Type.OBJECT,
  properties: {
    surface: { type: Type.STRING },
    lemma: { type: Type.STRING },
    gender: {
      type: Type.STRING,
      enum: ['der', 'die', 'das', 'none'],
    },
    pos: { type: Type.STRING },
    translationEn: { type: Type.STRING },
    exampleDe: { type: Type.STRING },
    exampleEn: { type: Type.STRING },
    plural: { type: Type.STRING },
  },
  required: ['surface', 'lemma', 'gender', 'pos', 'translationEn', 'exampleDe', 'exampleEn'],
};

const responseSchema = {
  type: Type.ARRAY,
  items: wordSchema,
};

const SYSTEM_PROMPT = `You are a German linguistic analyzer for a language-learning app.
For each German word given, return its dictionary form and metadata as JSON.

Rules:
- "lemma" is the dictionary form (verbs in infinitive, nouns in nominative singular).
- "gender" applies only to nouns: "der" (masculine), "die" (feminine), "das" (neuter). For non-nouns, return "none".
- "pos" is the part of speech: noun, verb, adj, adv, det, pron, num, propn, prep, conj, intj.
- "exampleDe" is a short, natural German sentence using the word in context.
- "exampleEn" is the English translation of that example sentence.
- "plural" applies only to nouns: the plural form (e.g. "Apfel" -> "Äpfel"). Empty string for non-nouns.
- "translationEn" is the most common English translation of the word in isolation.
- Skip filler/duplicates. If a word is unclear or appears to be a brand name, still analyze it but mark pos="propn".`;

function normalizeGender(g: string): WordAnalysis['gender'] {
  if (g === 'der' || g === 'die' || g === 'das') return g;
  return null;
}

export async function analyzeWords(surfaces: string[]): Promise<WordAnalysis[]> {
  if (surfaces.length === 0) return [];
  const apiKey = assertGeminiKey();
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Analyze these German words and return one JSON object per word, in the same order:\n${surfaces
    .map((s, i) => `${i + 1}. ${s}`)
    .join('\n')}`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema,
      temperature: 0.2,
    },
  });

  const text = response.text;
  if (!text) return [];

  const parsed = JSON.parse(text) as Array<{
    surface: string;
    lemma: string;
    gender: string;
    pos: string;
    translationEn: string;
    exampleDe: string;
    exampleEn: string;
    plural?: string;
  }>;

  return parsed.map((p) => ({
    surface: p.surface,
    lemma: p.lemma,
    gender: normalizeGender(p.gender),
    pos: p.pos.toLowerCase(),
    translationEn: p.translationEn,
    exampleDe: p.exampleDe,
    exampleEn: p.exampleEn,
    plural: p.plural && p.plural.length > 0 ? p.plural : null,
  }));
}
