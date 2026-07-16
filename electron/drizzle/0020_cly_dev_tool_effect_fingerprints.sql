ALTER TABLE cly_dev_tool_effects ADD COLUMN tool_name TEXT;
--> statement-breakpoint
ALTER TABLE cly_dev_tool_effects ADD COLUMN arguments_sha256 TEXT;
--> statement-breakpoint
CREATE TRIGGER cly_dev_tool_effects_fingerprint_insert
BEFORE INSERT ON cly_dev_tool_effects
FOR EACH ROW
WHEN NEW.tool_name IS NULL
  OR length(NEW.tool_name) = 0
  OR NEW.arguments_sha256 IS NULL
  OR length(NEW.arguments_sha256) != 64
  OR NEW.arguments_sha256 GLOB '*[^0-9a-f]*'
BEGIN
  SELECT RAISE(ABORT, 'cly_dev_tool_effects requires a valid tool fingerprint');
END;
--> statement-breakpoint
CREATE TRIGGER cly_dev_tool_effects_fingerprint_immutable
BEFORE UPDATE OF tool_name, arguments_sha256 ON cly_dev_tool_effects
FOR EACH ROW
WHEN OLD.tool_name IS NOT NEW.tool_name
  OR OLD.arguments_sha256 IS NOT NEW.arguments_sha256
BEGIN
  SELECT RAISE(ABORT, 'cly_dev_tool_effects fingerprint is immutable');
END;
