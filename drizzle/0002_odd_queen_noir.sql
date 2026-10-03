CREATE TABLE `public_read_limits` (
	`subject_hash` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`requests` integer NOT NULL,
	`last_seen` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `public_read_limits_last_seen` ON `public_read_limits` (`last_seen`);