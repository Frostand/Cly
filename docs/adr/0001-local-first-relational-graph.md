# ADR 0001: Local-first relational research graph

- Status: Accepted
- Date: 2026-07-10

## Context

Cly must connect sources, claims, external code, experiments, runs, and artifacts while remaining usable offline. The persistence choice must remain independent of any editor or client implementation.

## Decision

Store research objects, directed relationships, and provenance events in normalized SQLite tables managed by Drizzle. Typed TypeScript discriminated unions and Zod schemas define domain payloads. Large artifacts remain on disk and are referenced by stable identifiers and hashes.

## Consequences

The MVP needs no graph database or hosted service. Traversal queries may require recursive SQL or application-level composition. If scale later justifies a graph engine, the typed repository boundary provides a migration seam without changing UI contracts.
