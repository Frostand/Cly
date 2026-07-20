export const RESEARCH_OBJECT_TYPES = [
  "artifact",
  "source",
  "evidence",
  "claim",
  "experiment",
  "run",
] as const;

export type ResearchObjectType = (typeof RESEARCH_OBJECT_TYPES)[number];

export interface ArtifactPayload {
  kind: "artifact";
  mediaType?: string;
  path?: string;
  sha256?: string;
}

export interface SourcePayload {
  kind: "source";
  sourceType?:
    | "paper"
    | "pdf"
    | "webpage"
    | "book"
    | "dataset"
    | "documentation"
    | "repository"
    | "hugging-face"
    | "note"
    | "import";
  status?: "placeholder" | "resolved";
  authors?: string[];
  citation?: string;
  doi?: string;
  url?: string;
  providerId?: string;
  abstract?: string;
  year?: number;
  journal?: string;
  tags?: string[];
  folder?: string;
  extractedFields?: Record<string, ExtractedSourceValue>;
  contradictoryEvidence?: SourcePassage[];
  customReviewFields?: Record<string, ExtractedSourceValue>;
  provider?: string;
  normalizedKey?: string;
  importMethod?: "metadata" | "bibtex";
  importedAt?: string;
  groundedSummary?: GroundedLiteratureSummary;
  query?: string;
  rankingScore?: number;
  rankingMethod?: string;
  rankingModel?: string;
  rankingComponents?: Record<string, number>;
  rankingExplanation?: string;
  retrievedAt?: string;
  researchProblem?: string;
  methods?: string[];
  findings?: string[];
  limitations?: string[];
  enrichmentMethod?: string;
  enrichedAt?: string;
}

export interface EvidencePayload {
  kind: "evidence";
  sourceId: string;
  quote: string;
  locator?: string;
  contentHash: string;
  verificationState: "unverified" | "verified" | "rejected";
}

export interface SourcePassage {
  quote: string;
  locator?: string;
  sourceId?: string;
}

export interface ExtractedSourceValue {
  value: string;
  passage: SourcePassage;
  confidence: number;
  verificationState: "unverified" | "verified" | "rejected";
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface GroundedLiteratureSummary {
  text: string;
  method: "extractive_abstract_v1";
  generatedAt: string;
  claims: Array<{
    text: string;
    evidence: Array<{
      field: "abstract";
      locator: string;
      quote: string;
    }>;
  }>;
}

export interface ClaimPayload {
  kind: "claim";
  status: "draft" | "supported" | "contradicted" | "needs-evidence";
  reviewStatus?:
    | "Unsupported"
    | "Weak"
    | "Medium"
    | "Strong"
    | "Paper-ready"
    | "Invalidated"
    | "Needs review";
  reproducibilityStatus?: "not-assessed" | "passed" | "failed";
  openRiskCount?: number;
}

export interface ExperimentPayload {
  kind: "experiment";
  hypothesis?: string;
}

export interface RunPayload {
  kind: "run";
  commitSha?: string;
  status: "planned" | "running" | "completed" | "failed";
}

export type ResearchObjectPayload =
  | ArtifactPayload
  | SourcePayload
  | EvidencePayload
  | ClaimPayload
  | ExperimentPayload
  | RunPayload;
