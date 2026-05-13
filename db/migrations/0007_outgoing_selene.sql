CREATE TABLE `ignored_words` (
	`lemma` text PRIMARY KEY NOT NULL COLLATE NOCASE,
	`added_at` integer NOT NULL
);
