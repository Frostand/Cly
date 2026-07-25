import { createNewAgentSession, workbenchFixtureTabs } from "./fixtures";
import type {
  AgentApproval,
  AgentIdentity,
  AgentMessage,
  AgentSession,
  DiffFile,
  LiveFileEdit,
  NewAgentSessionInput,
  WorkbenchTab,
  WorkbenchTabType,
} from "./types";

export interface AgentRuntimeService {
  pause(sessionId: string): Promise<void>;
  stop(sessionId: string): Promise<void>;
  steer(sessionId: string, agentId: string, prompt: string): Promise<void>;
}

export interface AgentOrchestratorService {
  create(input: NewAgentSessionInput): Promise<AgentSession>;
  delegate(sessionId: string, agents: AgentIdentity[]): Promise<void>;
}

export interface AgentTranscriptService {
  send(sessionId: string, body: string): AsyncIterable<AgentMessage>;
}

export interface SessionService {
  archive(sessionId: string): Promise<void>;
  restore(sessionId: string): Promise<void>;
}

export interface WorkbenchTabService {
  create(type: WorkbenchTabType): Promise<WorkbenchTab>;
}

export interface BrowserService {
  navigate(url: string): Promise<{ title: string; url: string }>;
  addAsSource(url: string): Promise<void>;
}

export interface TerminalService {
  stream(sessionId: string): AsyncIterable<string>;
  restart(sessionId: string): Promise<void>;
}

export interface DiffService {
  list(sessionId: string): Promise<DiffFile[]>;
}

export interface LiveFileService {
  stream(sessionId: string): AsyncIterable<LiveFileEdit>;
}

export interface ApprovalService {
  resolve(
    sessionId: string,
    approvalId: string,
    state: AgentApproval["state"],
  ): Promise<void>;
}

export interface ContextService {
  estimate(packId: string): Promise<{ items: number; tokens: number }>;
}

export interface LayoutPersistenceService {
  load(projectId: string): Record<string, unknown> | null;
  save(projectId: string, value: Record<string, unknown>): void;
}

const wait = (milliseconds = 80) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

const fixtureTab = (type: WorkbenchTabType): WorkbenchTab => {
  const match = workbenchFixtureTabs().find((tab) => tab.type === type);
  if (!match) throw new Error(`Unsupported fixture tab type: ${type}`);
  return { ...match, id: `${match.id}-${Date.now()}`, pinned: false };
};

export const testFixtureAgentSessionServices = {
  runtime: {
    pause: async () => wait(),
    stop: async () => wait(),
    steer: async () => wait(),
  } satisfies AgentRuntimeService,
  orchestrator: {
    create: async (input) => {
      await wait();
      return createNewAgentSession(input);
    },
    delegate: async () => wait(),
  } satisfies AgentOrchestratorService,
  transcript: {
    async *send(_sessionId, body) {
      await wait(40);
      yield {
        id: `fixture-stream-${Date.now()}`,
        type: "reasoning",
        author: "Cly Orchestrator",
        title: "Working",
        body: `Interpreting “${body.slice(0, 64)}${body.length > 64 ? "…" : ""}” against the active context pack.`,
        timestamp: "Just now",
      };
      await wait(70);
      yield {
        id: `fixture-delegation-${Date.now()}`,
        type: "delegation",
        author: "Codex Implementation Agent",
        agentId: "fixture-implementation-agent",
        title: "Implementation investigation delegated",
        body: "Tracing the request through the active branch, linked research objects, and available test evidence.",
        timestamp: "Just now",
        metadata: ["Full agent session", "Starting", "Task-scoped context"],
        actions: ["Open agent", "View task", "Steer"],
      };
      await wait(70);
      yield {
        id: `fixture-review-${Date.now()}`,
        type: "agent_update",
        author: "Reviewer Agent",
        agentId: "fixture-reviewer-agent",
        title: "Independent review queued",
        body: "The Reviewer Agent has its own model, reasoning, permissions, context, task, and transcript, and will challenge the implementation result before handoff.",
        timestamp: "Just now",
        metadata: ["Full agent session", "Queued", "Read-only"],
        actions: ["Open agent", "View task", "Steer"],
      };
      await wait(120);
      yield {
        id: `fixture-response-${Date.now()}`,
        type: "orchestrator",
        author: "Cly Orchestrator",
        body: "I’ve added this direction to the active plan. The fixture runtime will keep the session moving while you inspect another surface.",
        timestamp: "Just now",
      };
    },
  } satisfies AgentTranscriptService,
  session: {
    archive: async () => wait(),
    restore: async () => wait(),
  } satisfies SessionService,
  workbench: {
    create: async (type) => fixtureTab(type),
  } satisfies WorkbenchTabService,
  browser: {
    navigate: async (url) => {
      await wait();
      return { title: "Fixture research page", url };
    },
    addAsSource: async () => wait(),
  } satisfies BrowserService,
  terminal: {
    async *stream() {
      for (const line of [
        "collecting tests…",
        "12 passed in 0.84s",
        "process exited with code 0",
      ]) {
        await wait(50);
        yield line;
      }
    },
    restart: async () => wait(),
  } satisfies TerminalService,
  diff: {
    list: async () => {
      const tab = fixtureTab("diff");
      return "files" in tab.state ? tab.state.files : [];
    },
  } satisfies DiffService,
  liveFiles: {
    async *stream() {
      const tab = fixtureTab("live-files");
      if (!("edits" in tab.state)) return;
      for (const edit of tab.state.edits) {
        await wait(60);
        yield edit;
      }
    },
  } satisfies LiveFileService,
  approval: {
    resolve: async () => wait(),
  } satisfies ApprovalService,
  context: {
    estimate: async () => ({ items: 11, tokens: 28_720 }),
  } satisfies ContextService,
  layout: {
    load: (projectId) => {
      try {
        return JSON.parse(
          localStorage.getItem(`cly-agent-layout:${projectId}`) ?? "null",
        ) as Record<string, unknown> | null;
      } catch {
        return null;
      }
    },
    save: (projectId, value) => {
      try {
        localStorage.setItem(
          `cly-agent-layout:${projectId}`,
          JSON.stringify(value),
        );
      } catch {
        // Persistence is best-effort in fixture and test environments.
      }
    },
  } satisfies LayoutPersistenceService,
};
