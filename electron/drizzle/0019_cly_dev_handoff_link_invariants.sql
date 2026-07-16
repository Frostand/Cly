CREATE TRIGGER `cly_dev_handoffs_materialized_link_insert`
BEFORE INSERT ON `cly_dev_handoffs`
WHEN
  (`NEW`.`materialized_session_id` IS NULL AND `NEW`.`materialized_at` IS NOT NULL)
  OR (`NEW`.`materialized_session_id` IS NOT NULL AND `NEW`.`materialized_at` IS NULL)
  OR (`NEW`.`materialized_session_id` IS NOT NULL AND `NEW`.`direction` != 'import')
  OR (
    `NEW`.`materialized_session_id` IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM `cly_dev_sessions`
      WHERE `id` = `NEW`.`materialized_session_id`
        AND `project_id` = `NEW`.`project_id`
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'materialized handoff links require paired fields, import direction, and a session in the same project');
END;--> statement-breakpoint
CREATE TRIGGER `cly_dev_handoffs_materialized_link_update`
BEFORE UPDATE OF `project_id`, `direction`, `materialized_session_id`, `materialized_at`
ON `cly_dev_handoffs`
WHEN
  (`NEW`.`materialized_session_id` IS NULL AND `NEW`.`materialized_at` IS NOT NULL)
  OR (`NEW`.`materialized_session_id` IS NOT NULL AND `NEW`.`materialized_at` IS NULL)
  OR (`NEW`.`materialized_session_id` IS NOT NULL AND `NEW`.`direction` != 'import')
  OR (
    `NEW`.`materialized_session_id` IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM `cly_dev_sessions`
      WHERE `id` = `NEW`.`materialized_session_id`
        AND `project_id` = `NEW`.`project_id`
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'materialized handoff links require paired fields, import direction, and a session in the same project');
END;
