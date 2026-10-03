CREATE TABLE `demo_user_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`target_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `demo_events_owner_time` ON `demo_user_events` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `demo_users` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`display_name` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "demo_kind" CHECK("demo_users"."kind" IN ('owner', 'test')),
	CONSTRAINT "demo_role" CHECK("demo_users"."role" IN ('admin', 'moderator', 'user')),
	CONSTRAINT "demo_status" CHECK("demo_users"."status" IN ('active', 'blocked')),
	CONSTRAINT "demo_owner_protected" CHECK("demo_users"."kind" != 'owner' OR ("demo_users"."role" = 'admin' AND "demo_users"."status" = 'active'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `demo_owner_email` ON `demo_users` (`owner_id`,`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `demo_workspace_owner` ON `demo_users` (`owner_id`) WHERE "demo_users"."kind" = 'owner';--> statement-breakpoint
CREATE TABLE `demo_write_limits` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`writes` integer NOT NULL
);
