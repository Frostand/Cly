import type { LiteraturePaper } from "../domain/literature-search";
import type { Relationship, ResearchObject } from "../domain/research-bridge";
import type {
  ClaimStatus,
  DecisionBrief,
  DecisionBriefFinding,
  DecisionBriefFindingStatus,
  LineageReviewDecision,
  LineageScanMeasurement,
  LineageSuggestion,
  ResearchProject,
} from "../domain/types";

export interface ResearchData {
  objects: ResearchObject[];
  relationships: Relationship[];
}

export interface CreateObjectInput {
  type: ResearchObject["type"];
  title: string;
  description?: string;
  payload: ResearchObject["payload"];
}

export interface CreateRelationshipInput {
  fromObjectId: string;
  toObjectId: string;
  type: Relationship["type"];
}

export interface ProvenanceEvent {
  id: string;
  projectId: string;
  objectId?: string;
  action: string;
  actorType: "human" | "system" | "agent" | "integration";
  actorId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  sequence?: number;
  previousHash?: string | null;
  eventHash?: string;
}

export interface ProvenanceIntegrity {
  valid: boolean;
  eventCount?: number;
  headHash?: string | null;
  reason?: string;
}

export interface CrossEncoderReranking {
  status: "completed" | "not_configured" | "unavailable" | "empty";
  method: string | null;
  model: string;
  signals: Array<{ sourceId: string; score: number }>;
  error?: string;
  errorKind?: string;
}

export interface LineageScanResult {
  projectId: string;
  suggestions: LineageSuggestion[];
  measurement: LineageScanMeasurement;
}

export interface ReviewerCapsuleManifestRecord {
  id: string;
  kind: string;
  currentness?: "current" | "stale";
  verification?: "verified" | "inferred";
  reproducibility?: "reproducible" | "documented-only" | "unverifiable";
  reason?: string;
}

export interface ReviewerCapsule {
  html: string;
  sha256: string;
  manifest: {
    version: number;
    generatedAt: string;
    selectedClaimIds: string[];
    included: ReviewerCapsuleManifestRecord[];
    omitted: ReviewerCapsuleManifestRecord[];
  };
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new ApiRequestError(
      (await response.text()).trim() || `Request failed (${response.status}).`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

const projectPath = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/research`;

/** Typed client for the SQLite-backed research API. */
export const apiClient = {
  ensureProject(project: ResearchProject) {
    return request<{
      id: string;
      name: string;
      path: string;
      metadata: Record<string, unknown>;
    }>(projectPath(project.id), {
      method: "PUT",
      body: JSON.stringify({
        name: project.name,
        path: project.path,
        metadata: {
          description: project.description,
          externalTransmissionApprovals: project.externalTransmissionApprovals,
          hypothesis: project.hypothesis,
          localOnly: project.localOnly,
          phase: project.phase,
          question: project.question,
        },
      }),
    });
  },

  fetchResearchData(projectId: string) {
    return request<ResearchData>(projectPath(projectId));
  },

  fetchProvenance(projectId: string, limit = 100) {
    return request<ProvenanceEvent[]>(
      `/api/projects/${encodeURIComponent(projectId)}/provenance?limit=${limit}`,
    );
  },

  verifyProvenance(projectId: string) {
    return request<ProvenanceIntegrity>(
      `/api/projects/${encodeURIComponent(projectId)}/provenance/integrity`,
    );
  },

  previewReviewerCapsule(projectId: string, claimIds: string[]) {
    return request<ReviewerCapsule>(
      `/api/projects/${encodeURIComponent(projectId)}/reviewer-capsule/preview`,
      {
        method: "POST",
        body: JSON.stringify({ claimIds }),
      },
    );
  },

  exportReviewerCapsule(projectId: string, claimIds: string[]) {
    return request<ReviewerCapsule>(
      `/api/projects/${encodeURIComponent(projectId)}/reviewer-capsule/export`,
      {
        method: "POST",
        body: JSON.stringify({ claimIds }),
      },
    );
  },

  fetchLineageSuggestions(projectId: string) {
    return request<LineageSuggestion[]>(
      `/api/projects/${encodeURIComponent(projectId)}/lineage-suggestions`,
    );
  },

  fetchDecisionBriefs(projectId: string) {
    return request<DecisionBrief[]>(
      `/api/projects/${encodeURIComponent(projectId)}/decision-briefs`,
    );
  },

  generateDecisionBrief(projectId: string, actor = "local-user") {
    return request<{
      brief: DecisionBrief | null;
      created: boolean;
      noChanges: boolean;
    }>(`/api/projects/${encodeURIComponent(projectId)}/decision-briefs`, {
      method: "POST",
      body: JSON.stringify({ actor }),
    });
  },

  transitionDecisionBriefFinding(
    projectId: string,
    briefId: string,
    findingId: string,
    input: {
      status: DecisionBriefFindingStatus;
      owner?: string | null;
      reason?: string | null;
      actor?: string;
    },
  ) {
    return request<DecisionBriefFinding>(
      `/api/projects/${encodeURIComponent(projectId)}/decision-briefs/${encodeURIComponent(briefId)}/findings/${encodeURIComponent(findingId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
  },

  scanLineage(projectId: string) {
    return request<LineageScanResult>(
      `/api/projects/${encodeURIComponent(projectId)}/lineage-suggestions/scan`,
      { method: "POST" },
    );
  },

  reviewLineageSuggestions(
    projectId: string,
    decisions: LineageReviewDecision[],
    actor = "local-user",
  ) {
    return request<{ suggestions: LineageSuggestion[] }>(
      `/api/projects/${encodeURIComponent(projectId)}/lineage-suggestions/review`,
      {
        method: "POST",
        body: JSON.stringify({ actor, decisions }),
      },
    );
  },

  createObject(projectId: string, input: CreateObjectInput) {
    return request<ResearchObject>(`${projectPath(projectId)}/objects`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateSource(
    projectId: string,
    sourceId: string,
    input: { description: string; payload: Record<string, unknown> },
  ) {
    return request<ResearchObject>(
      `${projectPath(projectId)}/objects/${encodeURIComponent(sourceId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
  },

  updateClaimStatus(projectId: string, claimId: string, status: ClaimStatus) {
    return request<ResearchObject>(
      `${projectPath(projectId)}/claims/${encodeURIComponent(claimId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          reviewStatus: status,
        }),
      },
    );
  },

  createRelationship(projectId: string, input: CreateRelationshipInput) {
    return request<Relationship>(`${projectPath(projectId)}/relationships`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  reviewRelationship(
    projectId: string,
    relationshipId: string,
    input: { reviewState: "approved" | "rejected"; confidence: number | null },
  ) {
    return request<Relationship>(
      `${projectPath(projectId)}/relationships/${encodeURIComponent(relationshipId)}/review`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
  },

  searchLiterature(projectId: string, query: string, limit = 25) {
    return request<{
      papers: LiteraturePaper[];
      provider: string;
      reranking: CrossEncoderReranking;
    }>(`/api/projects/${encodeURIComponent(projectId)}/literature/search`, {
      method: "POST",
      body: JSON.stringify({ query, limit }),
    });
  },
};
