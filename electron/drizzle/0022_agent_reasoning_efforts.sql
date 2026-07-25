-- cly:ensure-column agent_role_configurations reasoning_effort TEXT CHECK (reasoning_effort IS NULL OR reasoning_effort IN ('low', 'medium', 'high', 'xhigh', 'max', 'ultra'))
--> statement-breakpoint
UPDATE agent_role_configurations
SET reasoning_effort = reasoning_level
WHERE reasoning_effort IS NULL;
