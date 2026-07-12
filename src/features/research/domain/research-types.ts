export const RESEARCH_OBJECT_TYPES = [
  "artifact",
  "source",
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
  status?: "placeholder" | "resolved";
  authors?: string[];
  citation?: string;
  doi?: string;
  url?: string;
  providerId?: string;
  abstract?: string;
  year?: number;
  provider?: string;
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

export interface ClaimPayload {
  kind: "claim";
  status: "draft" | "supported" | "contradicted" | "needs-evidence";
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
  | ClaimPayload
  | ExperimentPayload
  | RunPayload;
