-- A relationship must remain entirely inside its declared research project.
-- Repository validation catches normal writes; these triggers protect imports
-- and future service implementations that write SQL directly.
CREATE TRIGGER IF NOT EXISTS `research_relationships_project_matches_from_object`
BEFORE INSERT ON `research_relationships`
FOR EACH ROW
WHEN (SELECT project_id FROM research_objects WHERE id = NEW.from_object_id) != NEW.project_id
BEGIN
  SELECT RAISE(ABORT, 'Research relationship source must belong to its project.');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `research_relationships_project_matches_to_object`
BEFORE INSERT ON `research_relationships`
FOR EACH ROW
WHEN (SELECT project_id FROM research_objects WHERE id = NEW.to_object_id) != NEW.project_id
BEGIN
  SELECT RAISE(ABORT, 'Research relationship target must belong to its project.');
END;
