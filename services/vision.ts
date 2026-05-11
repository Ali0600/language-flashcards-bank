import { File } from 'expo-file-system';
import { GoogleGenAI, Type } from '@google/genai';

import { FOLDER_SLUGS, normalizeCategory, type FolderSlug } from '@/constants/folders';
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
    category: { type: Type.STRING, enum: FOLDER_SLUGS as unknown as string[] },
  },
  required: ['rawText', 'words', 'category'],
};

const SYSTEM_PROMPT = `You are a German vocabulary extractor for a language-learning app.
Given an image (food packaging, a poster, a sign, a household label), do THREE things:
1. Transcribe all visible German text into "rawText".
2. Extract every distinct content word into "words" with linguistic analysis.
3. Classify the overall scene into one "category".

Rules for words:
- "surface" is the form as it appears in the image.
- "lemma" is the dictionary form (verbs infinitive, nouns nominative singular).
- "gender" for nouns: "der" / "die" / "das". For non-nouns: "none".
- "pos": noun, verb, adj, adv, prep, conj, intj, propn, num.
- Skip determiners/articles/pronouns/numerals/punctuation.
- Brand names: include but mark pos="propn".
- Skip duplicates (same lemma).
- "exampleDe" / "exampleEn": short natural sentence demonstrating use.
- "plural" for nouns only; empty string otherwise.

Rules for category (pick exactly one):
- "food_drink_packaging": boxes, cans, bottles, ingredient labels, grocery items.
- "cooking_recipes": cooking instructions, recipe cards, baking directions, kitchen text.
- "household_items": cleaning supplies, toiletries, appliance labels (non-electronic).
- "signs_notices": street signs, posters, warnings, store signage, public notices.
- "transport_travel": trains, buses, tickets, maps, station boards, travel info.
- "health_personal_care": medications, pharmacy, body products, first aid.
- "documents_mail": letters, forms, bills, receipts, official paperwork.
- "clothing_textiles": clothing tags, care labels, fashion text.
- "electronics_appliances": device manuals, tech packaging, electronic appliance labels.
- "outdoor_nature": parks, trails, gardening, weather, outdoor signs.
- "other": anything that does not clearly fit one of the above.
Pick the single best fit. If unsure, use "other".`;

function normalizeGender(g: string): WordAnalysis['gender'] {
  if (g === 'der' || g === 'die' || g === 'das') return g;
  return null;
}

export type VisionResult = {
  rawText: string;
  words: WordAnalysis[];
  category: FolderSlug | null;
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
  if (!text) return { rawText: '', words: [], category: null };

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
    category?: string;
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
    category: normalizeCategory(parsed.category),
  };
}
