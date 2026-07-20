-- Evidence-chain records are versioned so every durable mutation can expose
-- the persisted revision that produced the current state.
-- cly:ensure-column research_objects version INTEGER NOT NULL DEFAULT 1
--> statement-breakpoint
-- cly:ensure-column research_relationships version INTEGER NOT NULL DEFAULT 1
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `research_evidence_passage_unique`
  ON `research_objects` (
    `project_id`,
    json_extract(`payload`, '$.sourceId'),
    json_extract(`payload`, '$.contentHash'),
    COALESCE(json_extract(`payload`, '$.locator'), '')
  )
  WHERE `type` = 'evidence';
