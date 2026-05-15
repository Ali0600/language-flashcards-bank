CREATE TABLE `sub_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_slug` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sub_categories_parent_name_nocase` ON `sub_categories` (`parent_slug`,`name` COLLATE NOCASE);--> statement-breakpoint
ALTER TABLE `photos` ADD `sub_category_id` text;