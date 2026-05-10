CREATE TABLE `card_sightings` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`photo_id` text NOT NULL,
	`surface_form` text NOT NULL,
	`seen_at` integer NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sightings_card_idx` ON `card_sightings` (`card_id`);--> statement-breakpoint
CREATE INDEX `sightings_photo_idx` ON `card_sightings` (`photo_id`);--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`lemma` text NOT NULL,
	`gender` text,
	`pos` text,
	`translation_en` text,
	`example_de` text,
	`example_en` text,
	`plural` text,
	`due` integer NOT NULL,
	`stability` real DEFAULT 0 NOT NULL,
	`difficulty` real DEFAULT 0 NOT NULL,
	`elapsed_days` real DEFAULT 0 NOT NULL,
	`scheduled_days` real DEFAULT 0 NOT NULL,
	`learning_steps` integer DEFAULT 0 NOT NULL,
	`reps` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`state` integer DEFAULT 0 NOT NULL,
	`last_review` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cards_lemma_unique` ON `cards` (`lemma`);--> statement-breakpoint
CREATE INDEX `cards_due_idx` ON `cards` (`due`);--> statement-breakpoint
CREATE INDEX `cards_state_idx` ON `cards` (`state`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`taken_at` integer NOT NULL,
	`image_uri` text NOT NULL,
	`raw_ocr_text` text,
	`ocr_source` text
);
--> statement-breakpoint
CREATE TABLE `review_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`rating` integer NOT NULL,
	`reviewed_at` integer NOT NULL,
	`state` integer NOT NULL,
	`due_before` integer NOT NULL,
	`due_after` integer NOT NULL,
	`stability` real NOT NULL,
	`difficulty` real NOT NULL,
	`elapsed_days` real NOT NULL,
	`scheduled_days` real NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `review_logs_card_idx` ON `review_logs` (`card_id`);