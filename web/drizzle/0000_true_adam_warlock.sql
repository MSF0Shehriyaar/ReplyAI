CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_jobs_status_created` ON `jobs` (`status`,`created`);--> statement-breakpoint
CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`created` integer NOT NULL,
	`demo` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_activity_created` ON `activity` (`created`);--> statement-breakpoint
CREATE TABLE `encrypted_secrets` (
	`key` text PRIMARY KEY NOT NULL,
	`cipher` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspace_state` (
	`key` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `threads` (
	`id` text PRIMARY KEY NOT NULL,
	`demo` integer DEFAULT 0 NOT NULL,
	`payload` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_threads_demo_updated` ON `threads` (`demo`,`updated`);--> statement-breakpoint
CREATE TABLE `usage` (
	`day` text PRIMARY KEY NOT NULL,
	`calls` integer DEFAULT 0 NOT NULL,
	`tokens` integer DEFAULT 0 NOT NULL,
	`sent` integer DEFAULT 0 NOT NULL
);
