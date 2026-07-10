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
};
