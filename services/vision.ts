import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { GoogleGenAI, Type } from '@google/genai';

import { FOLDER_SLUGS, normalizeCategory, type FolderSlug } from '@/constants/folders';
import { assertGeminiKey } from '@/lib/env';
import type { BBox, WordAnalysis } from '@/lib/types';

const MODEL = 'gemini-2.5-flash';
const REQUEST_TIMEOUT_MS = 90_000;
const MAX_IMAGE_DIMENSION = 1600;

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
    // Bounding box for the surface form as it appears in the image.
    // Gemini's standard object-detection format: [ymin, xmin, ymax, xmax]
    // normalized to [0, 1000]. Client converts to pixels.
    bbox: {
      type: Type.ARRAY,
      items: { type: Type.INTEGER },
      minItems: '4',
      maxItems: '4',
      description: 'Bounding box [ymin, xmin, ymax, xmax] normalized to 0-1000.',
    },
  },
  required: ['surface', 'lemma', 'gender', 'pos', 'translationEn', 'exampleDe', 'exampleEn', 'bbox'],
};

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    rawText: { type: Type.STRING },
    words: { type: Type.ARRAY, items: wordSchema },
    category: { type: Type.STRING, enum: [...FOLDER_SLUGS] },
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
- "bbox" is the bounding box of the surface form as it appears in the image, in the format [ymin, xmin, ymax, xmax] normalized to 0–1000. Box should tightly enclose just the word.

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

async function resizeAndEncode(imageUri: string): Promise<string> {
  const resized = await manipulateAsync(
    imageUri,
    [{ resize: { width: MAX_IMAGE_DIMENSION } }],
    { compress: 0.85, format: SaveFormat.JPEG, base64: true },
  );
  if (!resized.base64) {
    throw new Error('Image manipulator returned no base64 data');
  }
  return resized.base64;
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('aborted')) return false;
    if (msg.includes('timeout') || msg.includes('network')) return true;
    if (/\b5\d\d\b/.test(msg)) return true;
    if (msg.includes('fetch failed')) return true;
  }
  return false;
}

async function callGemini(base64: string): Promise<string | undefined> {
  const apiKey = assertGeminiKey();
  const ai = new GoogleGenAI({ apiKey });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
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
        abortSignal: controller.signal,
      },
    });
    return response.text;
  } finally {
    clearTimeout(timer);
  }
}

export async function analyzeImage(imageUri: string): Promise<VisionResult> {
  const base64 = await resizeAndEncode(imageUri);

  let text: string | undefined;
  try {
    text = await callGemini(base64);
  } catch (err) {
    if (!isRetryableError(err)) throw err;
    console.warn('Gemini call failed, retrying once:', err);
    text = await callGemini(base64);
  }

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
      bbox?: unknown;
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
      bbox: normalizeBbox(p.bbox),
    })),
    category: normalizeCategory(parsed.category),
  };
}

function normalizeBbox(value: unknown): BBox | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const nums = value.map((v) => (typeof v === 'number' ? v : Number(v)));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  // Clamp into the documented [0, 1000] range. Gemini occasionally returns
  // out-of-bounds coords for cropped/edge words; clamping keeps the overlay
  // inside the image rect.
  const clamp = (n: number) => Math.max(0, Math.min(1000, Math.round(n)));
  const [ymin, xmin, ymax, xmax] = nums.map(clamp);
  // Discard degenerate boxes (zero area or inverted).
  if (ymin === undefined || xmin === undefined || ymax === undefined || xmax === undefined) {
    return null;
  }
  if (ymax <= ymin || xmax <= xmin) return null;
  return [ymin, xmin, ymax, xmax];
}
