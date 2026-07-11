# ADR-001: Fork with isolated extension boundaries

- Status: Accepted
- Date: 2026-07-11

## Context

Cly needs desktop IDE, Git, terminal, chat, and provider foundations from Dream IDE while retaining a viable upstream-update path.

## Decision

Maintain a fork with `upstream` configured as `https://github.com/dreamide/dream.git`. Build research capabilities in new feature-local renderer, API, persistence, and service directories. Limit edits to Dream core to registration points and typed contracts.

## Alternatives

- A separate companion application: avoids fork changes but cannot deliver an integrated research workspace.
- Deeply modify existing IDE modules: faster initially but creates high merge and security risk.
- Wait for a formal plugin SDK: unavailable and would block MVP delivery.

## Consequences and risks

The fork can diverge and local integration seams must be maintained. Every upstream sync requires CI, packaged-app validation, and review of preload, process, Git, API, and database conflicts. Revisit if Dream publishes a stable plugin architecture that satisfies required capabilities.
