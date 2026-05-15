import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const photos = sqliteTable('photos', {
  id: text('id').primaryKey(),
  takenAt: integer('taken_at').notNull(),
  imageUri: text('image_uri').notNull(),
  rawOcrText: text('raw_ocr_text'),
  category: text('category'),
  // Optional second-dimension classification, only used for categories in
  // FOLDERS_WITH_SUBCATEGORIES (today: `screenshots` only, where this points
  // at a specific app like Instagram). Soft reference — no FK because
  // op-sqlite doesn't enforce them and the schema avoids them elsewhere;
  // services/subcategory.ts handles referential cleanup on delete.
  subCategoryId: text('sub_category_id'),
});

export const cards = sqliteTable(
  'cards',
  {
    id: text('id').primaryKey(),
    lemma: text('lemma').notNull(),
    gender: text('gender', { enum: ['der', 'die', 'das'] }),
    pos: text('pos'),
    translationEn: text('translation_en'),
    exampleDe: text('example_de'),
    exampleEn: text('example_en'),
    plural: text('plural'),
    notes: text('notes'),
    direction: text('direction', { enum: ['de_to_en', 'en_to_de'] })
      .notNull()
      .default('de_to_en'),

    due: integer('due').notNull(),
    stability: real('stability').notNull().default(0),
    difficulty: real('difficulty').notNull().default(0),
    elapsedDays: real('elapsed_days').notNull().default(0),
    scheduledDays: real('scheduled_days').notNull().default(0),
    learningSteps: integer('learning_steps').notNull().default(0),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    state: integer('state').notNull().default(0),
    lastReview: integer('last_review'),

    createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex('cards_lemma_direction_unique').on(table.lemma, table.direction),
    index('cards_due_idx').on(table.due),
    index('cards_state_idx').on(table.state),
  ],
);

export const cardSightings = sqliteTable(
  'card_sightings',
  {
    id: text('id').primaryKey(),
    cardId: text('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    photoId: text('photo_id')
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    surfaceForm: text('surface_form').notNull(),
    seenAt: integer('seen_at').notNull(),
    // Bounding box of the surface form in the source photo. JSON-encoded
    // 4-element array [ymin, xmin, ymax, xmax] normalized to 0–1000 (Gemini's
    // standard format). Null for legacy sightings or words Gemini couldn't
    // confidently localize.
    bbox: text('bbox'),
  },
  (table) => [
    index('sightings_card_idx').on(table.cardId),
    index('sightings_photo_idx').on(table.photoId),
  ],
);

export const reviewLogs = sqliteTable(
  'review_logs',
  {
    id: text('id').primaryKey(),
    cardId: text('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    reviewedAt: integer('reviewed_at').notNull(),
    state: integer('state').notNull(),
    dueBefore: integer('due_before').notNull(),
    dueAfter: integer('due_after').notNull(),
    stability: real('stability').notNull(),
    difficulty: real('difficulty').notNull(),
    elapsedDays: real('elapsed_days').notNull(),
    scheduledDays: real('scheduled_days').notNull(),
  },
  (table) => [index('review_logs_card_idx').on(table.cardId)],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch() * 1000)`),
});

// Words the user has chosen to skip in future scans. Compared case-insensitively
// (the SQL primary key uses `COLLATE NOCASE`) so "Brot", "brot", and "BROT"
// collapse to a single entry. Pipeline filters Gemini's output against this
// table before any cards or sightings are persisted.
export const ignoredWords = sqliteTable('ignored_words', {
  lemma: text('lemma').primaryKey(),
  addedAt: integer('added_at').notNull(),
});

// Per-parent sub-categories. Currently only `parent_slug='screenshots'` is
// used (sub-cats hold app names like "Instagram", "Twitter"). The unique
// index in the generated SQL is hand-edited to `COLLATE NOCASE` so casing
// variations of the same name collapse to a single row.
export const subCategories = sqliteTable(
  'sub_categories',
  {
    id: text('id').primaryKey(),
    parentSlug: text('parent_slug').notNull(),
    name: text('name').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [uniqueIndex('sub_categories_parent_name_nocase').on(table.parentSlug, table.name)],
);

export type Photo = typeof photos.$inferSelect;
export type NewPhoto = typeof photos.$inferInsert;
export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
export type CardSighting = typeof cardSightings.$inferSelect;
export type NewCardSighting = typeof cardSightings.$inferInsert;
export type ReviewLog = typeof reviewLogs.$inferSelect;
export type IgnoredWord = typeof ignoredWords.$inferSelect;
export type NewIgnoredWord = typeof ignoredWords.$inferInsert;
export type NewReviewLog = typeof reviewLogs.$inferInsert;
export type Setting = typeof settings.$inferSelect;
export type SubCategory = typeof subCategories.$inferSelect;
export type NewSubCategory = typeof subCategories.$inferInsert;
