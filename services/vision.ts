import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { GoogleGenAI, Type } from '@google/genai';

import { FOLDER_SLUGS, normalizeCategory, type FolderSlug } from '@/constants/folders';
import { assertGeminiKey } from '@/lib/env';
import type { BBox, WordAnalysis } from '@/lib/types';
import { sanitizeArticle } from './vision-helpers';

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
    // Only set when category is 'screenshots' — names the app or platform
    // (e.g. "Instagram", "Discord"). Empty string otherwise. Not in
    // `required` because some older clients/models can omit empty fields.
    appName: {
      type: Type.STRING,
      description: 'For screenshots only: the app/platform shown. Empty otherwise.',
    },
  },
  required: ['rawText', 'words', 'category'],
};

const SYSTEM_PROMPT = `You are a German vocabulary extractor for a language-learning app.
Given an image (food packaging, a poster, a sign, a household label, a screenshot), do THREE things:
1. Transcribe all visible text in the image — German or otherwise — into "rawText".
2. Extract ONLY genuine German content words into "words" with linguistic analysis.
3. Classify the overall scene into one "category".

CRITICAL: GERMAN-ONLY FILTER for the "words" array.

The "words" array is for German vocabulary the user will study as flashcards. It MUST contain only words that are genuine German vocabulary. Non-German words — English, French, Spanish, brand names that are clearly English, anything else — MUST be omitted entirely from "words" even if they appear in the image. Including a non-German word as if it were German is the single worst failure mode of this app.

A word qualifies as German ONLY IF all of the following are true:
- It appears in a standard German dictionary (Duden, DWDS, Wiktionary "de") as a German lexeme. "Park", "Hand", "Finger" qualify (they are real German nouns that happen to look like English). "Day", "Settings", "Profile", "Home", "Login" do NOT — they are English UI labels.
- You can give it a real German gender/conjugation WITHOUT inventing one. If you have to guess that an English word "must be der/die/das" because it looks like a noun, it is not German — skip it.
- Its example sentence ("exampleDe") would use this word in natural native German prose, not as a code-switch or quotation of an English term.

When in doubt, OMIT the word. False positives (a fake German card like "der Day") are far worse than missed words. A scan that returns an empty "words" array is a perfectly valid output for an image full of non-German text.

Screenshots in particular: app UIs, button labels, menu items, and tweets are usually English even on a German user's phone. Treat screenshot text with extra skepticism — only extract words that are unambiguously German.

Examples of what NOT to do:
  ❌ "der Day"      — Day is English; there is no German lexeme "Day".
  ❌ "der Settings" — English UI label.
  ❌ "der Login"    — English loan, not standard German vocabulary.
  ❌ "die Profile"  — English; the German equivalent would be "Profil" (das).
  ❌ "das alles"    — alles is an indefinite pronoun (lowercase lemma → not a noun). Use gender="none".
  ❌ "der gut"      — gut is an adjective; no article. Use gender="none".
  ❌ "das gehen"    — gehen is a verb infinitive; no article. (The substantivized form "das Gehen" capitalized IS a noun and DOES take "das".)
Examples of what TO extract when present:
  ✓ "der Tag"      — actual German for "day".
  ✓ "die Einstellungen" — actual German for "settings".
  ✓ "kürzer"        — German comparative adjective. gender="none".
  ✓ "alles"         — indefinite pronoun. gender="none", pos="pron".
  ✓ "nichts"        — indefinite pronoun. gender="none", pos="pron".
  ✓ "das Gehen"     — substantivized verb (capitalized noun). gender="das" is correct.

Rules for the per-word fields (apply only to words that passed the German-only filter):
- "surface" is the form as it appears in the image.
- "lemma" is the dictionary form (verbs infinitive, nouns nominative singular).
- "gender" for nouns: "der" / "die" / "das". For non-nouns: "none". Do NOT assign a gender to a word that lacks one in actual German.
- CAPITALIZATION CHECK — read carefully. In standard German, nouns are ALWAYS capitalized in their dictionary (lemma) form. If the lemma starts with a lowercase letter, the word is NOT a noun and gender MUST be "none" — no exceptions. This rule prevents the common error of stamping "das" / "der" / "die" on indefinite pronouns ("alles", "nichts", "etwas", "viele", "alle"), quantifiers ("viel", "wenig"), adjectives ("gut", "schnell"), adverbs ("hier", "jetzt"), and verb infinitives ("gehen", "sehen"). The lemma's case is what matters, NOT the surface form: a sentence-initial "Alles" still has lemma "alles" with gender="none".
- "pos": noun, verb, adj, adv, prep, conj, intj, propn, pron, num.
- Skip articles, determiners, basic personal pronouns (ich, du, er, sie, es, wir, ihr, Sie, mich, dich, ...), and punctuation. Indefinite pronouns (alles, nichts, etwas, jemand, niemand, viele, alle, einige, manche, ...) ARE worth including as flashcard vocabulary — extract them with pos="pron" and gender="none".

TRANSLATION FORMAT — "translationEn" must follow the per-POS shape below so the user's flashcards have a predictable, consistent appearance. Read carefully and apply exactly:
- pos="noun":  lowercase singular English noun, NO English article. ✓ "Tag" → "day"   ❌ "Day" / "the day" / "days".
- pos="propn": accepted English form, capitalized as in English. ✓ "München" → "Munich", "Berlin" → "Berlin".
- pos="verb":  "to <verb>" infinitive marker, lowercase. ✓ "sparen" → "to save", "gehen" → "to go", "vergessen" → "to forget"   ❌ "save" / "Save" / "saving".
- pos="adj":   lowercase base / positive form. ✓ "schnell" → "fast", "klein" → "small". For comparative lemmas like "kürzer", translate as the comparative: "shorter".
- pos="adv":   lowercase, no prefix. ✓ "hier" → "here", "jetzt" → "now", "oft" → "often".
- pos="prep":  lowercase preposition only. ✓ "mit" → "with", "ohne" → "without". Do NOT append the German case (e.g. NOT "with (+ dative)").
- pos="conj":  lowercase. ✓ "und" → "and", "aber" → "but", "weil" → "because".
- pos="pron":  lowercase. ✓ "alles" → "everything", "nichts" → "nothing", "etwas" → "something".
- pos="intj":  natural English equivalent, lowercase. ✓ "hoppla" → "oops".
- pos="num":   spelled-out lowercase (though numerals are usually skipped per the Skip rule). ✓ "eins" → "one".

CONTEXTUAL TRANSLATION — when a German adjective, verb, or noun has multiple valid English glosses that diverge by domain, choose the one that fits the SCENE you classified the image as AND the exampleDe sentence you produce. Translating the lemma in isolation often misses the natural English collocation. Use the image's domain (food packaging, skincare label, household sign, etc.) as the disambiguator.
  ✓ "pflegend" on a hand cream / shampoo → "nourishing" (or "conditioning"); on a person caring for someone → "caring".
  ✓ "frisch" on food packaging → "fresh"; on a weather sign about the air → "cool".
  ✓ "kräftig" describing flavor on a coffee bag → "rich"; describing a person → "strong".
  ✓ "weich" on a fabric softener → "soft"; describing a person's voice → "gentle".
  ✓ "trocken" on a wine label → "dry"; on skincare → "dry" (same); on a tea description → "dry" — same gloss, context just confirms.
When two senses apply equally well to the scene, list both separated by ", " with the more natural-in-context one FIRST (e.g. "nourishing, caring"). exampleEn MUST read as natural native English — never a word-for-word swap from exampleDe if that sounds awkward. If exampleDe uses the word in a specific contextual sense, exampleEn should use the matching English gloss for that sense, NOT the literal lemma translation. Example: lemma "pflegend", exampleDe "Sie hat eine pflegende Handcreme" → exampleEn "She has a nourishing hand cream" (NOT "She has a caring hand cream").

- Brand names: include only if the brand IS itself a German word (e.g. "Milka" — no; "Apfelschorle" on a label — yes as the noun). Otherwise omit; do not extract every logo on a package.
- Skip duplicates (same lemma).
- "exampleDe" / "exampleEn": short natural sentence demonstrating use in real German.
- "plural" for nouns only; empty string otherwise. Use the actual German plural ("Tage"), not a made-up one ("Days").
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
- "screenshots": phone screenshots, app UIs, social-media posts, browser windows, anything that is clearly a digital screen capture rather than a physical object.
- "other": anything that does not clearly fit one of the above.
Pick the single best fit. If unsure, use "other".

Rules for appName:
- If category is "screenshots", set "appName" to the app or platform shown (e.g. "Instagram", "Twitter", "Discord", "Safari", "WhatsApp", "iMessage"). Use the user-facing brand name. If you cannot identify the app, leave appName as empty string.
- For all other categories, leave "appName" as empty string.`;

function normalizeGender(g: string): WordAnalysis['gender'] {
  if (g === 'der' || g === 'die' || g === 'das') return g;
  return null;
}

export type VisionResult = {
  rawText: string;
  words: WordAnalysis[];
  category: FolderSlug | null;
  /** App/platform name when `category === 'screenshots'`; null otherwise or when Gemini couldn't identify one. */
  appName: string | null;
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

function buildUserPrompt(focusRegion: BBox | null): string {
  if (!focusRegion) {
    return 'Transcribe and extract German vocabulary from this image.';
  }
  const [ymin, xmin, ymax, xmax] = focusRegion;
  // Region hint: send the full image (so category + rawText stay accurate),
  // but constrain word extraction to the user-highlighted rectangle. Words
  // whose center sits inside this rectangle should be extracted; words
  // outside it should be skipped.
  return [
    'Transcribe and extract German vocabulary from this image.',
    `The user has highlighted a focus region: [ymin=${ymin}, xmin=${xmin}, ymax=${ymax}, xmax=${xmax}] in 0–1000 normalized coordinates.`,
    'For the "words" array, ONLY include words whose bounding-box center falls inside that region. Skip all other words.',
    'Still transcribe the FULL visible text in the image into "rawText" (not just the region), and classify the ENTIRE scene into "category" as usual.',
  ].join(' ');
}

async function callGemini(base64: string, focusRegion: BBox | null): Promise<string | undefined> {
  const apiKey = assertGeminiKey();
  const ai = new GoogleGenAI({ apiKey });

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64 } },
            { text: buildUserPrompt(focusRegion) },
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
  } catch (err) {
    // Distinguish our own timeout from any other abort (network reset, app
    // backgrounded, etc.) so the user-facing alert tells them which.
    if (timedOut) {
      throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function analyzeImage(
  imageUri: string,
  opts?: { focusRegion?: BBox | null },
): Promise<VisionResult> {
  const base64 = await resizeAndEncode(imageUri);
  const focusRegion = opts?.focusRegion ?? null;

  let text: string | undefined;
  try {
    text = await callGemini(base64, focusRegion);
  } catch (err) {
    if (!isRetryableError(err)) throw err;
    console.warn('Gemini call failed, retrying once:', err);
    text = await callGemini(base64, focusRegion);
  }

  if (!text) return { rawText: '', words: [], category: null, appName: null };

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
    appName?: string;
  };

  const category = normalizeCategory(parsed.category);
  // Only carry appName when category landed on screenshots — Gemini may
  // populate it speculatively even for other scenes, but it's only meaningful
  // (and only used by the sub-cat picker) under screenshots.
  const rawAppName = (parsed.appName ?? '').trim();
  const appName = category === 'screenshots' && rawAppName.length > 0 ? rawAppName : null;

  return {
    rawText: parsed.rawText,
    words: parsed.words.map((p) => {
      const pos = p.pos.toLowerCase();
      return {
        surface: p.surface,
        lemma: p.lemma,
        gender: sanitizeArticle(pos, p.lemma, normalizeGender(p.gender)),
        pos,
        translationEn: p.translationEn,
        exampleDe: p.exampleDe,
        exampleEn: p.exampleEn,
        plural: p.plural && p.plural.length > 0 ? p.plural : null,
        bbox: normalizeBbox(p.bbox),
      };
    }),
    category,
    appName,
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
