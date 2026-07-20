-- Static notebook imports preserve exact evidence and verification state on
-- inferred graph edges. Ensure-column directives keep upgrades idempotent for
-- databases created between research-graph releases.
-- dream:ensure-column research_relationships evidence TEXT NOT NULL DEFAULT '[]'
--> statement-breakpoint
-- dream:ensure-column research_relationships verification_state TEXT NOT NULL DEFAULT 'unverified'
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS research_relationship_evidence_validate_insert
BEFORE INSERT ON research_relationships
WHEN json_valid(NEW.evidence) = 0
  OR json_type(NEW.evidence) <> 'array'
  OR NEW.verification_state NOT IN ('unverified', 'reviewed', 'approved', 'rejected')
BEGIN
  SELECT RAISE(ABORT, 'Invalid research relationship evidence or verification state');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS research_relationship_evidence_validate_update
BEFORE UPDATE OF evidence, verification_state ON research_relationships
WHEN json_valid(NEW.evidence) = 0
  OR json_type(NEW.evidence) <> 'array'
  OR NEW.verification_state NOT IN ('unverified', 'reviewed', 'approved', 'rejected')
BEGIN
  SELECT RAISE(ABORT, 'Invalid research relationship evidence or verification state');
END;
