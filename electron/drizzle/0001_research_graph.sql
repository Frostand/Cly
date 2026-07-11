CREATE TABLE IF NOT EXISTS `research_objects` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL,
  `type` text NOT NULL,
  `title` text NOT NULL,
  `description` text DEFAULT '' NOT NULL,
  `payload` text DEFAULT '{}' NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `research_objects_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `research_objects_payload_json` CHECK(json_valid(`payload`))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_research_objects_project_type` ON `research_objects` (`project_id`, `type`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `research_relationships` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL,
  `from_object_id` text NOT NULL,
  `to_object_id` text NOT NULL,
  `type` text NOT NULL,
  `created_at` text NOT NULL,
  CONSTRAINT `research_relationships_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `research_relationships_from_object_id_research_objects_id_fk` FOREIGN KEY (`from_object_id`) REFERENCES `research_objects`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `research_relationships_to_object_id_research_objects_id_fk` FOREIGN KEY (`to_object_id`) REFERENCES `research_objects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `research_relationship_unique` ON `research_relationships` (`project_id`, `from_object_id`, `to_object_id`, `type`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_research_relationships_project_from` ON `research_relationships` (`project_id`, `from_object_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_research_relationships_project_to` ON `research_relationships` (`project_id`, `to_object_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `provenance_events` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL,
  `object_id` text,
  `action` text NOT NULL,
  `actor_type` text NOT NULL,
  `actor_id` text,
  `metadata` text DEFAULT '{}' NOT NULL,
  `created_at` text NOT NULL,
  CONSTRAINT `provenance_events_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `provenance_events_object_id_research_objects_id_fk` FOREIGN KEY (`object_id`) REFERENCES `research_objects`(`id`) ON UPDATE no action ON DELETE set null,
  CONSTRAINT `provenance_events_metadata_json` CHECK(json_valid(`metadata`))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_provenance_events_project_created` ON `provenance_events` (`project_id`, `created_at`);
