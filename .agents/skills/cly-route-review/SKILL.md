---
name: cly-route-review
description: Review or design any Cly route and select the correct research-cockpit layout pattern, data representation, inspector behavior, responsive rules, and toolkit components instead of defaulting to dashboards or card grids.
---

# Cly route review

1. Read `references/route-patterns.md` and locate the route.
2. Identify the primary user decision, dominant data shape, and detail relationship.
3. Select one primary layout pattern and at most one supporting pattern.
4. Use tables for comparison, lists for scanning, timelines for change, graphs for relationships, and split panes for persistent master/detail work.
5. Verify the route at populated, empty, loading, error, large, and narrow states.
6. Reject card grids unless independent visual objects genuinely require them.

Use `$cly-design-system` for implementation and `$cly-visual-polish` for rendered verification.
