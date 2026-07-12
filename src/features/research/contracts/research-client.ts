/** Transport-neutral contracts shared by every Cly research client. */

export type ResearchClientKind =
  | "desktop"
  | "code-workspace"
  | "vscode-extension"
  | "jupyter"
  | "cli"
  | "mcp"
  | "github";

export type ResearchObjectRef = {
  projectId: string;
  objectId: string;
};

export type Attachment =
  | {
      kind: "code";
      uri: string;
      revision?: string;
      lineStart?: number;
      lineEnd?: number;
    }
  | { kind: "commit"; repository: string; sha: string }
  | { kind: "notebook"; uri: string; contentHash?: string; cellIds?: string[] }
  | {
      kind: "run";
      runId: string;
      status: "planned" | "running" | "completed" | "failed";
    }
  | { kind: "artifact"; uri: string; mediaType?: string; sha256?: string };

export type ResearchCapability =
  | "research:read"
  | "research:write"
  | "attachment:read"
  | "attachment:write";

export interface AuthorizationContext {
  actorId: string;
  client: ResearchClientKind;
  capabilities: readonly ResearchCapability[];
}

export interface ProvenanceInput {
  occurredAt: string;
  operationId: string;
  origin: { client: ResearchClientKind; installationId?: string };
  sourceUri?: string;
  contentHash?: string;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface AttachRequest {
  target: ResearchObjectRef;
  attachment: Attachment;
  authorization: AuthorizationContext;
  provenance: ProvenanceInput;
}

export interface AttachmentRecord {
  id: string;
  target: ResearchObjectRef;
  attachment: Attachment;
  provenance: ProvenanceInput;
  createdAt: string;
}

export type ResearchFailureCode =
  | "invalid-request"
  | "unauthenticated"
  | "permission-denied"
  | "not-found"
  | "conflict"
  | "unavailable"
  | "internal";

export interface ResearchFailure {
  code: ResearchFailureCode;
  message: string;
  retryable: boolean;
  operationId?: string;
  details?: Readonly<Record<string, string>>;
}

export type ResearchResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ResearchFailure };

/** Implementations may use HTTP, IPC, stdio, or an in-process adapter. */
export interface ResearchClient {
  attach(request: AttachRequest): Promise<ResearchResult<AttachmentRecord>>;
  listAttachments(
    target: ResearchObjectRef,
    authorization: AuthorizationContext,
  ): Promise<ResearchResult<readonly AttachmentRecord[]>>;
}
