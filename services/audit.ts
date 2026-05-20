import { and, eq, inArray, isNull } from 'drizzle-orm';
import { GoogleGenAI, Type } from '@google/genai';

import { db } from '@/db/client';
import { cards, cardSightings, photos, type Card } from '@/db/schema';
import { assertGeminiKey } from '@/lib/env';

const MODEL = 'gemini-2.5-flash';
const REQUEST_TIMEOUT_MS = 60_000;
/**
 * Cards per Gemini call. Keep moderate so token budgets stay reasonable
 * and a single batch failure doesn't tank the whole audit. 10 ≈ ~1.5KB
 * input + responses comfortably inside the model's context.
 */
const BATCH_SIZE = 10;

export type AuditField =
  | 'lemma'
  | 'gender'
  | 'translationEn'
  | 'exampleDe'
  | 'exampleEn'
  | 'plural';

export type AuditIssue = {
  field: AuditField;
  /**
   * Suggested replacement. Empty string is the canonical "set to null"
   * for `gender` and `plural` (the columns are nullable and an empty
   * string would otherwise round-trip wrong).
   */
  suggestedValue: string;
  /** Short one-sentence explanation Gemini gives for the change. */
  rationale: string;
};

export type AuditEverydayConcern = {
  /** Why Gemini thinks this card isn't useful for everyday vocab. */
  rationale: string;
};

export type AuditResult = {
  cardId: string;
  issues: AuditIssue[];
  /** Non-null when Gemini flagged the card as outside everyday vocab. */
  everyday: AuditEverydayConcern | null;
};

const issueSchema = {
  type: Type.OBJECT,
  properties: {
    field: {
      type: Type.STRING,
      enum: ['lemma', 'gender', 'translationEn', 'exampleDe', 'exampleEn', 'plural'],
    },
    suggestedValue: { type: Type.STRING },
    rationale: { type: Type.STRING },
  },
  required: ['field', 'suggestedValue', 'rationale'],
};

const resultItemSchema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    issues: { type: Type.ARRAY, items: issueSchema },
    everydayRationale: {
      type: Type.STRING,
      description:
        'Empty string if the card IS everyday vocabulary; otherwise a short one-sentence explanation of why it is not.',
    },
  },
  required: ['id', 'issues', 'everydayRationale'],
};

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    results: {
      type: Type.ARRAY,
      items: resultItemSchema,
    },
  },
  required: ['results'],
};

const SYSTEM_PROMPT = `You are reviewing German vocabulary flashcards from a learning app. The user captures these from photos of their daily life (food packaging, signs, screenshots, household items, etc.). The goal is to learn EVERYDAY German — words a learner will actually encounter and use.

For each input card, validate it on two axes:

1) CORRECTNESS — issues to fix in the existing fields. For each field that's wrong, return one issue. ALSO check that lemma / translationEn / exampleDe / exampleEn are INTERNALLY CONSISTENT — they must all refer to the same word form. The canonical failure mode is a positive-form lemma paired with a comparative translation (or vice versa). Examples of the inconsistency you should flag:
   - lemma="wenig" + translationEn="less" → either fix the lemma to "weniger" (if exampleDe uses the comparative) or fix the translation to "little" / "few" (if exampleDe uses the base form). Pick whichever produces fewer cascading rewrites given what exampleDe actually contains.
   - lemma="gut" + translationEn="better" → either lemma="besser" + translation="better", or lemma="gut" + translation="good".
   - lemma="viel" + translationEn="more" → either lemma="mehr" + translation="more", or lemma="viel" + translation="much" / "many".
   - lemma="kurz" + translationEn="shorter" → either lemma="kürzer" + translation="shorter", or lemma="kurz" + translation="short".
   When you flag this kind of inconsistency, ALSO verify that the example sentences match the form you're settling on. If you propose changing the lemma to a comparative and exampleDe already uses the comparative, exampleEn should use the comparative gloss too. If exampleDe uses the base form, the lemma fix should bring everything back to the base form.

   - "lemma": is it a real German word in dictionary (citation) form? Verbs as infinitives, nouns as nominative singular, adjectives as base form.
   - "gender": correct article for the noun ("der" / "die" / "das")? Use "none" for non-nouns. CAPITALIZATION CHECK: in German, nouns are ALWAYS capitalized in their dictionary form. A lowercase lemma (e.g. "alles", "schnell", "gehen") CANNOT be a noun — its gender MUST be "none".
   - "translationEn": accurate, useful English gloss AND follows the TRANSLATION FORMAT below (so flashcards have a predictable shape — flag a card as needing a translationEn fix if it's correct in meaning but wrong in format, e.g. "save" for a verb instead of "to save"). ALSO flag when the gloss is correct in isolation but contextually unnatural for the way the word is used in exampleDe — e.g. "pflegend" → "caring" is fine for a person, but in "Sie hat eine pflegende Handcreme" the natural English is "nourishing". Suggest the contextually natural gloss, or the multi-sense form "primary, secondary" (most natural first) when both senses apply equally.
   - "exampleDe": grammatical, natural German sentence that demonstrates the word in context?
   - "exampleEn": faithful AND natural native English translation of exampleDe. Flag when the existing exampleEn is a word-for-word swap from German that reads awkwardly to a native English speaker (e.g. "She has a caring hand cream" — a native would say "nourishing"). The translationEn fix and the exampleEn fix often pair: if you're flagging one for a context mismatch, check the other too.
   - "plural": correct plural form (for nouns only)? Empty string for non-nouns.

   TRANSLATION FORMAT — apply per POS exactly:
     * pos="noun":  lowercase singular English noun, NO English article. ✓ "day"  ❌ "the day" / "Day" / "days".
     * pos="propn": accepted English form, capitalized. ✓ "Munich", "Berlin".
     * pos="verb":  "to <verb>" infinitive marker, lowercase. ✓ "to save", "to go", "to forget"  ❌ "save" / "Save" / "saving".
     * pos="adj":   lowercase base / positive form. ✓ "fast", "small". Comparative lemma → comparative gloss ("shorter").
     * pos="adv":   lowercase, no prefix. ✓ "here", "now", "often".
     * pos="prep":  lowercase preposition only. ✓ "with", "without". Do NOT append the German case.
     * pos="conj":  lowercase. ✓ "and", "but", "because".
     * pos="pron":  lowercase. ✓ "everything", "nothing", "something".
     * pos="intj":  natural English equivalent, lowercase.
     * pos="num":   spelled-out lowercase. ✓ "one".

   Only return an issue when the value clearly needs to change. Do NOT pad with cosmetic rephrasings — if the field is already fine, omit it. A translationEn that's correct in meaning but wrong in format (e.g. "save" for a verb) IS a real issue and should be flagged with the corrected format ("to save").

   Use empty string "" as the suggestedValue to indicate "clear this field" (gender → none, plural → no plural).

   GERMAN-ONLY: if the lemma is not actually German (e.g. an English UI label like "Settings" got extracted by mistake), flag it as a "lemma" issue with the closest valid German equivalent and a rationale saying so.

2) EVERYDAY-USEFULNESS — separately, judge whether the card is worth keeping for an everyday-German learner.
   - Useful: words anyone might encounter in normal life — food, household items, common actions, common adjectives, common pronouns, common signs, common social interactions.
   - Less useful: obscure technical jargon, archaic / literary terms, regional dialect, brand-specific marketing copy, fragments that aren't really a word.
   - Most cards should pass. Be CONSERVATIVE — only flag when the word is clearly outside everyday vocabulary. Common words should NEVER be flagged.
   - If the card IS everyday-useful, set "everydayRationale" to an empty string "".
   - If the card is NOT everyday-useful, set "everydayRationale" to a short one-sentence reason (e.g. "Archaic legal term, rarely used in modern speech.").

Output strict JSON in the form:
{
  "results": [
    {
      "id": "<the card id you were given>",
      "issues": [{ "field": "...", "suggestedValue": "...", "rationale": "..." }],
      "everydayRationale": "<empty string if useful, else short reason>"
    }
  ]
}

Return ONE result per input card, in the SAME order. Do not invent new cards. Do not recommend deletion as an issue — deletion is the user's call.`;

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

async function callGeminiBatch(
  batch: Card[],
  signal: AbortSignal,
): Promise<AuditResult[]> {
  const apiKey = assertGeminiKey();
  const ai = new GoogleGenAI({ apiKey });

  // Strip the FSRS schedule fields from the prompt — Gemini doesn't need them
  // to judge correctness and they bloat the token count.
  const payload = batch.map((c) => ({
    id: c.id,
    lemma: c.lemma,
    gender: c.gender ?? 'none',
    pos: c.pos ?? '',
    translationEn: c.translationEn ?? '',
    exampleDe: c.exampleDe ?? '',
    exampleEn: c.exampleEn ?? '',
    plural: c.plural ?? '',
  }));

  // Per-batch safety timeout. The caller-supplied `signal` covers user-driven
  // cancellation (the audit screen aborts on unmount), but a Gemini call that
  // stalls below the network layer wouldn't be caught by that alone — there's
  // no socket-level timeout in the SDK. So we chain a local AbortController
  // that aborts on EITHER (a) the outer signal firing, or (b) our own timer.
  // Whichever fires first wins; the local controller's signal is what we pass
  // to the SDK. On a timeout-driven abort we rethrow a distinct message so
  // `isRetryableError` (which filters out "aborted") doesn't accidentally
  // retry — same convention as `services/vision.ts`.
  const localController = new AbortController();
  let timedOut = false;
  const onOuterAbort = () => localController.abort();
  signal.addEventListener('abort', onOuterAbort, { once: true });
  const localTimer = setTimeout(() => {
    timedOut = true;
    localController.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Validate these ${batch.length} German flashcards:\n\n${JSON.stringify(payload, null, 2)}`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema,
        temperature: 0.2,
        abortSignal: localController.signal,
      },
    });
    const text = response.text;
    if (!text) return batch.map((c) => ({ cardId: c.id, issues: [], everyday: null }));
    const parsed = JSON.parse(text) as {
      results: Array<{
        id: string;
        issues: Array<{ field: string; suggestedValue: string; rationale: string }>;
        everydayRationale: string;
      }>;
    };
    return parsed.results.map((r) => ({
      cardId: r.id,
      issues: r.issues
        .filter((i) => isAuditField(i.field))
        .map((i) => ({
          field: i.field as AuditField,
          suggestedValue: i.suggestedValue ?? '',
          rationale: i.rationale ?? '',
        })),
      everyday:
        r.everydayRationale && r.everydayRationale.trim().length > 0
          ? { rationale: r.everydayRationale.trim() }
          : null,
    }));
  } catch (err) {
    if (timedOut) {
      throw new Error(`Audit batch timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(localTimer);
    signal.removeEventListener('abort', onOuterAbort);
  }
}

function isAuditField(s: string): s is AuditField {
  return (
    s === 'lemma' ||
    s === 'gender' ||
    s === 'translationEn' ||
    s === 'exampleDe' ||
    s === 'exampleEn' ||
    s === 'plural'
  );
}

/**
 * Audit a batch of cards through Gemini. Streams progress through
 * `onProgress` as each batch completes. Aborts cleanly when the supplied
 * `signal` fires (the audit UI uses this to bail when the user backs out
 * of the screen).
 */
export async function auditCards(
  cardsList: Card[],
  signal: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<AuditResult[]> {
  const total = cardsList.length;
  const allResults: AuditResult[] = [];
  for (let i = 0; i < total; i += BATCH_SIZE) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const batch = cardsList.slice(i, i + BATCH_SIZE);
    let res: AuditResult[];
    try {
      res = await callGeminiBatch(batch, signal);
    } catch (err) {
      if (signal.aborted) throw err;
      if (!isRetryableError(err)) throw err;
      console.warn('Audit batch failed, retrying once:', err);
      res = await callGeminiBatch(batch, signal);
    }
    allResults.push(...res);
    onProgress?.(Math.min(i + BATCH_SIZE, total), total);
  }
  return allResults;
}

/**
 * Fetch every forward (de_to_en) card in scope for a folder + optional
 * sub-cat filter. Mirrors the predicate logic from `useFolderDueCards`
 * but DROPS the due-date filter — the audit considers all cards, not
 * just due ones.
 *
 * `subId` semantics match the folder route:
 *   undefined → no sub-cat filter (parent without sub-cats, or "All" mode)
 *   null      → photos with `sub_category_id IS NULL` (Uncategorized bucket)
 *   string    → a specific sub-cat row id
 */
export async function fetchFolderCardsForAudit(
  parentSlug: string,
  subId: string | null | undefined,
): Promise<Card[]> {
  const subPredicate =
    subId === undefined
      ? undefined
      : subId === null
        ? isNull(photos.subCategoryId)
        : eq(photos.subCategoryId, subId);
  const photoWhere = subPredicate
    ? and(eq(photos.category, parentSlug), subPredicate)
    : eq(photos.category, parentSlug);

  // Two-step: get distinct card IDs in scope, then full card rows.
  // Drizzle's selectDistinct + innerJoin doesn't play nicely with the
  // full-row selection (would need GROUP BY all columns), so split into
  // an ID query first and an inArray lookup second.
  const idRows = await db
    .selectDistinct({ id: cards.id })
    .from(cards)
    .innerJoin(cardSightings, eq(cardSightings.cardId, cards.id))
    .innerJoin(photos, eq(photos.id, cardSightings.photoId))
    .where(and(eq(cards.direction, 'de_to_en'), photoWhere))
    .all();
  if (idRows.length === 0) return [];
  const ids = idRows.map((r) => r.id);
  return db.select().from(cards).where(inArray(cards.id, ids)).all();
}

/**
 * Normalize a suggested value into the right DB representation. Most
 * fields are plain strings; `gender` and `plural` are nullable and use
 * empty string to mean "clear".
 */
function normalizeFieldValue(field: AuditField, raw: string): string | null {
  if (field === 'gender') {
    if (raw === 'der' || raw === 'die' || raw === 'das') return raw;
    return null;
  }
  if (field === 'plural') {
    return raw.trim().length === 0 ? null : raw.trim();
  }
  // lemma / translationEn / exampleDe / exampleEn — empty string clears,
  // anything else keeps as-is.
  return raw.trim().length === 0 ? null : raw;
}

/**
 * Apply the user-confirmed audit changes to the cards table. Each change
 * is a (cardId, field, suggestedValue) triple. Updates are grouped by
 * card so each row is touched at most once, then committed in a single
 * transaction. Any change that violates the (lemma, direction) unique
 * constraint surfaces as a transaction-level error to the caller — the
 * UI handles user-facing reporting.
 */
export async function applyAuditChanges(
  changes: { cardId: string; field: AuditField; suggestedValue: string }[],
): Promise<void> {
  if (changes.length === 0) return;
  const byCard = new Map<string, Record<string, string | null>>();
  for (const c of changes) {
    const value = normalizeFieldValue(c.field, c.suggestedValue);
    const existing = byCard.get(c.cardId) ?? {};
    existing[c.field] = value;
    byCard.set(c.cardId, existing);
  }
  await db.transaction(async (tx) => {
    const now = Date.now();
    for (const [cardId, fields] of byCard) {
      await tx
        .update(cards)
        .set({ ...fields, updatedAt: now })
        .where(eq(cards.id, cardId));
    }
  });
}
