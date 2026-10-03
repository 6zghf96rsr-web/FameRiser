CREATE TABLE `instagram_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`username` text NOT NULL,
	`social_url` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `instagram_owner_username` ON `instagram_accounts` (`owner_id`,`username`);--> statement-breakpoint
CREATE TABLE `instagram_write_limits` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`writes` integer NOT NULL
);
