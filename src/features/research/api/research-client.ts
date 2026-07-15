import type {
  ArtifactLineage,
  CodeVersionRef,
  DatasetVersionRef,
  ExperimentDefinitionContent,
  ExperimentDefinitionVersion,
  ExperimentLineage,
  ExperimentRun,
  RunArtifact,
  RunMetric,
  RunStatus,
} from "../contracts/experiment-provenance";
import type { Relationship } from "../domain/relationship";
import type { ResearchObject } from "../domain/research-object";

export interface ResearchGraph {
  objects: ResearchObject[];
  relationships: Relationship[];
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    throw new Error(
      (await response.text()) || `Request failed (${response.status}).`,
    );
  }
  return response.json() as Promise<T>;
}

export const researchClient = {
  list(projectId: string) {
    return request<ResearchGraph>(
      `/api/projects/${encodeURIComponent(projectId)}/research`,
    );
  },
  createSource(projectId: string, input: { title: string; url: string }) {
    return request<ResearchObject>(
      `/api/projects/${encodeURIComponent(projectId)}/research/objects`,
      {
        method: "POST",
        body: JSON.stringify({
          type: "source",
          title: input.title,
          payload: { kind: "source", url: input.url },
        }),
      },
    );
  },
  createClaim(projectId: string, input: { title: string }) {
    return request<ResearchObject>(
      `/api/projects/${encodeURIComponent(projectId)}/research/objects`,
      {
        method: "POST",
        body: JSON.stringify({
          type: "claim",
          title: input.title,
          payload: { kind: "claim", status: "draft" },
        }),
      },
    );
  },
  linkEvidence(projectId: string, sourceId: string, claimId: string) {
    return request<Relationship>(
      `/api/projects/${encodeURIComponent(projectId)}/research/relationships`,
      {
        method: "POST",
        body: JSON.stringify({
          fromObjectId: sourceId,
          toObjectId: claimId,
          type: "supports",
        }),
      },
    );
  },
  createExperiment(
    projectId: string,
    input: {
      id?: string;
      title: string;
      description?: string;
      definition: ExperimentDefinitionContent;
      actorId?: string;
    },
  ) {
    return request<{
      id: string;
      projectId: string;
      title: string;
      description: string;
      definition: ExperimentDefinitionVersion;
    }>(`/api/projects/${encodeURIComponent(projectId)}/experiments`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  reviseExperimentDefinition(
    projectId: string,
    experimentId: string,
    definition: ExperimentDefinitionContent,
  ) {
    return request<ExperimentDefinitionVersion>(
      `/api/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(experimentId)}/definitions`,
      { method: "POST", body: JSON.stringify({ definition }) },
    );
  },
  createRun(
    projectId: string,
    experimentId: string,
    input: {
      id?: string;
      title: string;
      description?: string;
      status?: RunStatus;
      commitSha: string;
      configuration?: Record<string, unknown>;
      datasets?: DatasetVersionRef[];
      codeRefs?: CodeVersionRef[];
      startedAt?: string;
      finishedAt?: string | null;
      exitCode?: number | null;
    },
  ) {
    return request<ExperimentRun>(
      `/api/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(experimentId)}/runs`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },
  updateRunStatus(
    projectId: string,
    runId: string,
    input: {
      status: Exclude<RunStatus, "planned">;
      finishedAt?: string | null;
      exitCode?: number | null;
    },
  ) {
    return request<ExperimentRun>(
      `/api/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/status`,
      { method: "PATCH", body: JSON.stringify(input) },
    );
  },
  logMetrics(
    projectId: string,
    runId: string,
    metrics: Array<{
      name: string;
      value: number;
      unit?: string | null;
      step?: number | null;
      loggedAt?: string;
    }>,
  ) {
    return request<RunMetric[]>(
      `/api/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/metrics`,
      { method: "POST", body: JSON.stringify({ metrics }) },
    );
  },
  registerArtifact(
    projectId: string,
    runId: string,
    input: {
      id?: string;
      title: string;
      description?: string;
      kind: "figure" | "table" | "file";
      path: string;
      mediaType: string;
      contentHash: string;
      generatorPath?: string | null;
      generatorHash?: string | null;
      generatedAt?: string;
    },
  ) {
    return request<RunArtifact>(
      `/api/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/artifacts`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },
  assessArtifactStaleness(
    projectId: string,
    artifactId: string,
    current: {
      commitSha?: string;
      configuration?: Record<string, unknown>;
      datasets?: DatasetVersionRef[];
      codeRefs?: CodeVersionRef[];
    },
  ) {
    return request<RunArtifact>(
      `/api/projects/${encodeURIComponent(projectId)}/artifacts/${encodeURIComponent(artifactId)}/staleness`,
      { method: "POST", body: JSON.stringify(current) },
    );
  },
  getExperimentLineage(projectId: string, experimentId: string) {
    return request<ExperimentLineage>(
      `/api/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(experimentId)}/lineage`,
    );
  },
  getArtifactLineage(projectId: string, artifactId: string) {
    return request<ArtifactLineage>(
      `/api/projects/${encodeURIComponent(projectId)}/artifacts/${encodeURIComponent(artifactId)}/lineage`,
    );
  },
};
