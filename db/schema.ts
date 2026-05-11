import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const photos = sqliteTable('photos', {
  id: text('id').primaryKey(),
  takenAt: integer('taken_at').notNull(),
  imageUri: text('image_uri').notNull(),
  rawOcrText: text('raw_ocr_text'),
  ocrSource: text('ocr_source', { enum: ['mlkit', 'gemini-vision'] }),
  category: text('category'),
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
    uniqueIndex('cards_lemma_unique').on(table.lemma),
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

export type Photo = typeof photos.$inferSelect;
export type NewPhoto = typeof photos.$inferInsert;
export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
export type CardSighting = typeof cardSightings.$inferSelect;
export type NewCardSighting = typeof cardSightings.$inferInsert;
export type ReviewLog = typeof reviewLogs.$inferSelect;
export type NewReviewLog = typeof reviewLogs.$inferInsert;
export type Setting = typeof settings.$inferSelect;
