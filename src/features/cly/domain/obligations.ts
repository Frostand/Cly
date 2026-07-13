export type ExternalProcessingRule = "allowed" | "review" | "blocked";
export type ObligationAlertSeverity = "info" | "warning" | "critical";
export type ObligationAlertState = "open" | "acknowledged" | "resolved";

export interface DatasetObligation {
  id: string;
  projectId: string;
  datasetObjectId: string;
  datasetTitle: string;
  consentProtocolScope: string;
  approvedPurposes: string[];
  permittedCollaborators: string[];
  externalProcessing: ExternalProcessingRule;
  permittedProviders: string[];
  residency: string[];
  retentionExpiresAt: string | null;
  deletionDueAt: string | null;
  license: string;
  owner: string;
  reviewDate: string | null;
  provenanceSource: string;
  notes: string;
  revision: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export type DatasetObligationInput = Omit<
  DatasetObligation,
  | "id"
  | "projectId"
  | "datasetObjectId"
  | "datasetTitle"
  | "revision"
  | "createdBy"
  | "updatedBy"
  | "createdAt"
  | "updatedAt"
> & { actorId: string };

export interface InheritedRestriction {
  obligationId: string;
  datasetObjectId: string;
  datasetTitle: string;
  consentProtocolScope: string;
  approvedPurposes: string[];
  externalProcessing: ExternalProcessingRule;
  residency: string[];
  retentionExpiresAt: string | null;
  deletionDueAt: string | null;
  license: string;
  owner: string;
  reviewDate: string | null;
}

export interface ObligationOperation {
  kind: "export" | "provider-transmission" | "integration";
  integration?: string;
  objectIds?: string[];
  purpose?: string | null;
  collaborators?: string[];
  provider?: string | null;
  residency?: string | null;
  license?: string | null;
  external?: boolean;
}

export interface ObligationAlert {
  id: string;
  projectId: string;
  sourceObligationId: string | null;
  sourceDatasetTitle: string | null;
  category:
    | "review-expiry"
    | "retention"
    | "deletion"
    | "external-processing"
    | "provider"
    | "purpose"
    | "collaborator"
    | "residency"
    | "license"
    | "evaluation";
  severity: ObligationAlertSeverity;
  affectedObjectIds: string[];
  rationale: string;
  resolution: string;
  operation: ObligationOperation | null;
  state: ObligationAlertState;
  acknowledgedBy?: string | null;
  acknowledgedAt?: string | null;
  resolutionNote?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ObligationEvaluation {
  projectId: string;
  decision: "allow" | "review" | "block";
  complete: boolean;
  evaluationHash: string;
  operation: ObligationOperation;
  alerts: ObligationAlert[];
  approval: {
    id: string;
    actorId: string;
    rationale: string;
    createdAt: string;
  } | null;
  inheritedRestrictions: Record<string, InheritedRestriction[]>;
  evaluatedAt: string;
}

export interface ObligationSummary {
  obligations: DatasetObligation[];
  alerts: ObligationAlert[];
  inheritedRestrictions: Record<string, InheritedRestriction[]>;
}

export const OBLIGATION_DISCLAIMER =
  "Cly supports workflow review. It does not provide legal advice, interpret law automatically, or guarantee compliance.";
