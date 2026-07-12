/**
 * Bridge between the UI domain types (src/features/cly/domain/types.ts)
 * and the validated research domain (src/features/research/domain/).
 *
 * The research domain is the canonical source of truth for persisted data.
 * The Cly UI domain adds UI-specific concerns (fixture modes, display fields,
 * screen navigation) that don't belong in the persistence layer.
 *
 * This module provides mapping functions so the two type systems stay
 * consistent and the UI can consume validated research data.
 */

export {
  RESEARCH_OBJECT_TYPES,
  type ResearchObjectType,
  type ResearchObjectPayload,
  type ArtifactPayload,
  type SourcePayload,
  type ClaimPayload,
  type ExperimentPayload,
  type RunPayload,
} from "../../research/domain/research-types";

export {
  researchObjectInputSchema,
  createResearchObject,
  type ResearchObject,
  type ResearchObjectInput,
} from "../../research/domain/research-object";

export {
  relationshipInputSchema,
  createRelationship,
  type Relationship,
  type RelationshipInput,
} from "../../research/domain/relationship";

export {
  provenanceEventInputSchema,
  createProvenanceEvent,
  type ProvenanceEvent,
  type ProvenanceEventInput,
} from "../../research/domain/provenance-event";
