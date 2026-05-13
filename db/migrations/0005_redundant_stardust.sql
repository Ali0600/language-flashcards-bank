DROP INDEX `cards_lemma_unique`;--> statement-breakpoint
ALTER TABLE `cards` ADD `direction` text DEFAULT 'de_to_en' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `cards_lemma_direction_unique` ON `cards` (`lemma`,`direction`);