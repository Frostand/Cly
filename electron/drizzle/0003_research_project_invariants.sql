-- Keep relationships project-scoped when direct SQL or import code updates
-- an existing row after the insert-time checks have run.
CREATE TRIGGER IF NOT EXISTS `research_relationships_project_matches_objects_on_update`
BEFORE UPDATE OF `project_id`, `from_object_id`, `to_object_id` ON `research_relationships`
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM research_objects
  WHERE id = NEW.from_object_id AND project_id = NEW.project_id
) OR NOT EXISTS (
  SELECT 1 FROM research_objects
  WHERE id = NEW.to_object_id AND project_id = NEW.project_id
)
BEGIN
  SELECT RAISE(ABORT, 'Research relationship objects must belong to its project.');
END;
--> statement-breakpoint
-- Provenance may be project-level (object_id is NULL), but object-level events
-- must reference an object owned by the same project.
CREATE TRIGGER IF NOT EXISTS `provenance_events_project_matches_object_on_insert`
BEFORE INSERT ON `provenance_events`
FOR EACH ROW
WHEN NEW.object_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM research_objects
  WHERE id = NEW.object_id AND project_id = NEW.project_id
)
BEGIN
  SELECT RAISE(ABORT, 'Provenance object must belong to its project.');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `provenance_events_project_matches_object_on_update`
BEFORE UPDATE OF `project_id`, `object_id` ON `provenance_events`
FOR EACH ROW
WHEN NEW.object_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM research_objects
  WHERE id = NEW.object_id AND project_id = NEW.project_id
)
BEGIN
  SELECT RAISE(ABORT, 'Provenance object must belong to its project.');
END;
