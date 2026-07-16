export type ContextOriginClass =
  | "approved_fact"
  | "inferred_fact"
  | "source_passage"
  | "file"
  | "conversation"
  | "graph_object";
export type ContextVerificationState =
  | "unverified"
  | "verified"
  | "stale"
  | "conflicted";
export type ContextSensitivity = "standard" | "restricted" | "local_only";
export type ContextRepresentation = "raw" | "summary";

export interface AgentContextRevision {
  id: string;
  projectId: string;
  itemId: string;
  revision: number;
  originClass: ContextOriginClass;
  referenceId: string;
  content: string;
  confidence: number | null;
  evidenceRefs: string[];
  lastCheckedAt: string | null;
  producerProcess: string;
  producerModel: string | null;
  verificationState: ContextVerificationState;
  sensitivity: ContextSensitivity;
  createdAt: string;
}

export interface AgentContextItem {
  id: string;
  projectId: string;
  label: string;
  approvedRevisionId: string | null;
  pinned: boolean;
  locked: boolean;
  deletedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  approvedRevision: AgentContextRevision | null;
  proposedRevisions: AgentContextRevision[];
  previouslyApprovedRevisions: AgentContextRevision[];
  revisions: AgentContextRevision[];
}

export interface AgentContextPackEntry {
  position: number;
  itemId: string;
  revisionId: string;
  originClass: ContextOriginClass;
  referenceId: string;
  representation: ContextRepresentation;
  selectionReason: string;
  sensitivity: ContextSensitivity;
  verificationState: ContextVerificationState;
}

export interface AgentContextPack {
  id: string;
  projectId: string;
  name: string;
  configurationId: string;
  roleId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  entries: AgentContextPackEntry[];
}

export interface ContextManifestEntry {
  position?: number;
  itemId?: string;
  kind: ContextOriginClass;
  referenceId: string;
  revisionId: string;
  representation: ContextRepresentation;
  tokenEstimate: number;
  selectionReason: string;
  sensitivity: Exclude<ContextSensitivity, "local_only">;
}

export interface ContextPrivacyWarning {
  code: string;
  message: string;
  referenceIds: string[];
}

export interface ContextManifestRequest {
  packId: string;
  configurationId: string;
  roleId: string;
  provider: string;
  model: string;
  purpose?: string;
  collaborators?: string[];
  residency?: string | null;
  license?: string | null;
}

export interface ContextObligationOperation {
  kind: "provider-transmission";
  integration: "agent-context";
  objectIds: string[];
  purpose: string;
  collaborators: string[];
  provider: string;
  residency: string | null;
  license: string | null;
  external: true;
}

export interface ContextManifestPreview {
  canonicalPayload: string;
  sha256: string;
  entryCount: number;
  totalTokens: number;
  entries: ContextManifestEntry[];
  excluded: Array<{ referenceId: string; reason: string }>;
  privacyWarnings: ContextPrivacyWarning[];
  selectedObjectIds: string[];
  obligationOperation: ContextObligationOperation;
  obligationOperationHash: string;
  restrictedReferenceIds: string[];
  obligationEvaluation: {
    decision: "allow" | "review" | "block";
    complete: boolean;
    evaluationHash: string;
  };
}

export interface ContextTransmissionApproval {
  id: string;
  projectId: string;
  manifestSha256: string;
  provider: string;
  model: string;
  restrictedReferenceIds: string[];
  actorId: string;
  rationale: string;
  state: "approved" | "revoked";
  expiresAt: string | null;
}

export interface PersistedContextManifest extends ContextManifestPreview {
  id: string;
  projectId: string;
  packId: string;
  configurationId: string;
  roleId: string;
  provider: string;
  model: string;
  schemaVersion: 1;
  idempotencyKey: string;
  obligationEvaluationHash: string;
  transmissionApprovalId: string | null;
  createdAt: string;
}

export interface AgentContextSnapshot {
  items: AgentContextItem[];
  packs: AgentContextPack[];
  manifests: PersistedContextManifest[];
}

export interface AgentContextActor {
  actorId: string;
  producerProcess: string;
  producerModel: string | null;
}
