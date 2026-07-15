CREATE TABLE IF NOT EXISTS `literature_reading_lists` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL,
  `name` text NOT NULL,
  `normalized_name` text NOT NULL,
  `description` text DEFAULT '' NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `literature_reading_lists_project_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `literature_reading_lists_project_name_unique` ON `literature_reading_lists` (`project_id`, `normalized_name`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_literature_reading_lists_project` ON `literature_reading_lists` (`project_id`, `updated_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `literature_reading_list_sources` (
  `reading_list_id` text NOT NULL,
  `source_id` text NOT NULL,
  `project_id` text NOT NULL,
  `added_at` text NOT NULL,
  CONSTRAINT `literature_reading_list_sources_list_fk` FOREIGN KEY (`reading_list_id`) REFERENCES `literature_reading_lists`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `literature_reading_list_sources_source_fk` FOREIGN KEY (`source_id`) REFERENCES `research_objects`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `literature_reading_list_sources_project_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
  PRIMARY KEY (`reading_list_id`, `source_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_literature_reading_list_sources_project_source` ON `literature_reading_list_sources` (`project_id`, `source_id`);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `literature_reading_list_sources_project_on_insert`
BEFORE INSERT ON `literature_reading_list_sources`
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM literature_reading_lists
  WHERE id = NEW.reading_list_id AND project_id = NEW.project_id
) OR NOT EXISTS (
  SELECT 1 FROM research_objects
  WHERE id = NEW.source_id AND project_id = NEW.project_id AND type = 'source'
)
BEGIN
  SELECT RAISE(ABORT, 'Reading list and source must belong to the same project.');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `literature_reading_list_sources_project_on_update`
BEFORE UPDATE OF `reading_list_id`, `source_id`, `project_id` ON `literature_reading_list_sources`
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM literature_reading_lists
  WHERE id = NEW.reading_list_id AND project_id = NEW.project_id
) OR NOT EXISTS (
  SELECT 1 FROM research_objects
  WHERE id = NEW.source_id AND project_id = NEW.project_id AND type = 'source'
)
BEGIN
  SELECT RAISE(ABORT, 'Reading list and source must belong to the same project.');
END;
