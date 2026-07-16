CREATE TRIGGER IF NOT EXISTS `cly_dev_sessions_linked_handoff_delete`
BEFORE DELETE ON `cly_dev_sessions`
WHEN EXISTS (
  SELECT 1 FROM `cly_dev_handoffs`
  WHERE `project_id` = `OLD`.`project_id`
    AND `materialized_session_id` = `OLD`.`id`
)
BEGIN
  SELECT RAISE(ABORT, 'linked Cly Dev sessions cannot be deleted while a materialized handoff references them');
END;
