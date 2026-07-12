import type { LiteraturePaper } from "../domain/literature-search";
import type { Relationship, ResearchObject } from "../domain/research-bridge";

export interface ResearchData {
  objects: ResearchObject[];
  relationships: Relationship[];
}

export interface CreateObjectInput {
  type: "source" | "claim";
  title: string;
  description?: string;
  payload: Record<string, unknown>;
}

export interface CreateRelationshipInput {
  fromObjectId: string;
  toObjectId: string;
  type: "supports" | "contradicts";
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
  fetchResearchData(projectId: string) {
    return request<ResearchData>(projectPath(projectId));
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

  createRelationship(projectId: string, input: CreateRelationshipInput) {
    return request<Relationship>(`${projectPath(projectId)}/relationships`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  searchLiterature(projectId: string, query: string, limit = 25) {
    return request<{ papers: LiteraturePaper[]; provider: string }>(
      `/api/projects/${encodeURIComponent(projectId)}/literature/search`,
      {
        method: "POST",
        body: JSON.stringify({ query, limit }),
      },
    );
  },
};
