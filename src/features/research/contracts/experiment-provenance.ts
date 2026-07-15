export type DatasetVersionRef = {
  id: string;
  version: string;
  contentHash?: string;
  uri?: string;
};

export type CodeVersionRef = {
  path: string;
  contentHash?: string;
};

export type ExperimentDefinitionContent = {
  hypothesis: string;
  objective?: string;
  configuration?: Record<string, unknown>;
  datasets?: DatasetVersionRef[];
  declaredMetrics?: string[];
};

export type ExperimentDefinitionVersion = {
  id: string;
  projectId: string;
  experimentId: string;
  version: number;
  hypothesis: string;
  objective: string;
  configuration: Record<string, unknown>;
  datasets: DatasetVersionRef[];
  declaredMetrics: string[];
  definitionHash: string;
  provenanceEventId: string;
  createdAt: string;
};

export type RunStatus =
  | "planned"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type RunMetric = {
  id: string;
  projectId: string;
  runId: string;
  name: string;
  value: number;
  unit: string | null;
  step: number | null;
  loggedAt: string;
  provenanceEventId: string;
};

export type ArtifactStaleReason =
  | {
      kind: "experiment-definition" | "git-commit";
      captured: string;
      current: string;
    }
  | {
      kind: "configuration" | "datasets" | "generating-code";
      capturedHash: string;
      currentHash: string;
    };

export type RunArtifact = {
  id: string;
  projectId: string;
  runId: string;
  title: string;
  description: string;
  kind: "figure" | "table" | "file";
  path: string;
  mediaType: string;
  contentHash: string;
  generatorPath: string | null;
  generatorHash: string | null;
  inputFingerprint: string;
  state: "current" | "stale";
  staleReasons: ArtifactStaleReason[];
  provenanceEventId: string;
  generatedAt: string;
  checkedAt: string;
};

export type ExperimentRun = {
  id: string;
  projectId: string;
  experimentId: string;
  title: string;
  description: string;
  definitionVersionId: string;
  status: RunStatus;
  commitSha: string;
  configuration: Record<string, unknown>;
  datasets: DatasetVersionRef[];
  codeRefs: CodeVersionRef[];
  inputFingerprint: string;
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  provenanceEventId: string;
  createdAt: string;
  updatedAt: string;
  definition: ExperimentDefinitionVersion;
  metrics: RunMetric[];
  artifacts: RunArtifact[];
};

export type ExperimentLineage = {
  experiment: {
    id: string;
    projectId: string;
    title: string;
    description: string;
  };
  definitions: ExperimentDefinitionVersion[];
  runs: ExperimentRun[];
};

export type ArtifactLineage = {
  experiment: ExperimentLineage["experiment"];
  definition: ExperimentDefinitionVersion;
  run: Omit<ExperimentRun, "artifacts">;
  artifact: RunArtifact;
};
