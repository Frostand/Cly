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
  createProvenanceEvent,
  type ProvenanceEvent,
  type ProvenanceEventInput,
  provenanceEventInputSchema,
} from "../../research/domain/provenance-event";
export {
  createRelationship,
  type Relationship,
  type RelationshipInput,
  relationshipInputSchema,
} from "../../research/domain/relationship";
export {
  type Artifact,
  type Claim,
  createResearchObject,
  type Evidence,
  type Experiment,
  type ProjectLifecycleObject,
  type ResearchObject,
  type ResearchObjectInput,
  type Run,
  researchObjectInputSchema,
  type Source,
} from "../../research/domain/research-object";
export {
  type ArtifactPayload,
  type ClaimPayload,
  type EvidencePayload,
  type ExperimentPayload,
  type GroundedLiteratureSummary,
  PROJECT_LIFECYCLE_OBJECT_TYPES,
  type ProjectLifecycleObjectType,
  type ProjectLifecyclePayload,
  type ProjectLifecycleStatus,
  RESEARCH_OBJECT_TYPES,
  type ResearchObjectPayload,
  type ResearchObjectType,
  type RunPayload,
  type SourcePayload,
} from "../../research/domain/research-types";
