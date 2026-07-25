// @vitest-environment node
import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prepareAttachments: vi.fn(),
  resolveCursorLaunch: vi.fn(),
  resolveLaunch: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: mocks.spawn };
});
vi.mock("./codex-cli-launch.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./codex-cli-launch.js")>();
  return { ...actual, resolveCodexCliLaunch: mocks.resolveLaunch };
});
vi.mock("./codex-prompt.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./codex-prompt.js")>();
  return {
    ...actual,
    prepareCodexPromptAttachments: mocks.prepareAttachments,
  };
});
vi.mock("../providers/cursor-cli.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../providers/cursor-cli.js")>();
  return { ...actual, resolveCursorCliLaunch: mocks.resolveCursorLaunch };
});

import { streamCodexAppServerResponse } from "./codex-app-server.js";
import { streamCodexCliResponse } from "./codex-cli-stream.js";
import { streamCursorResponse } from "./cursor-stream.js";

const messages = [
  {
    id: "user-1",
    parts: [
      {
        text: "CLY_PRIVATE_PROMPT_39d8 ; $(open -a Calculator)",
        type: "text",
      },
    ],
    role: "user",
  },
];

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

const createChild = () => {
  const child = new EventEmitter() as EventEmitter & {
    stdin: { end: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
    stderr: EventEmitter;
    stdout: EventEmitter;
  };
  child.stdin = { end: vi.fn(), write: vi.fn() };
  child.stderr = new EventEmitter();
  child.stdout = new EventEmitter();
  return child;
};

const providers = [
  {
    attachmentsBeforeLaunch: true,
    createResponse: (signal: AbortSignal) =>
      streamCodexCliResponse({
        abortSignal: signal,
        chatId: "chat-1",
        codexPermissionMode: "default",
        messages,
        model: "gpt-5",
        modelSpeed: "standard",
        projectPath: "/tmp",
        projectReferencesPrompt: null,
        reasoningEffort: "medium",
        remoteConversationId: null,
        remoteConversationModel: null,
        remoteConversationModelSpeed: null,
        remoteConversationProjectPath: null,
        responseMessageMetadata: {},
        systemPrompt: "",
      }),
    launchMock: mocks.resolveLaunch,
    name: "Codex CLI",
  },
  {
    attachmentsBeforeLaunch: false,
    createResponse: (signal: AbortSignal) =>
      streamCodexAppServerResponse({
        abortSignal: signal,
        chatId: "chat-1",
        codexPermissionMode: "default",
        messages,
        model: "gpt-5",
        modelSpeed: "standard",
        projectId: "project-1",
        projectPath: "/tmp",
        projectReferencesPrompt: null,
        reasoningEffort: "medium",
        responseMessageMetadata: {},
        systemPrompt: "",
      }),
    launchMock: mocks.resolveLaunch,
    name: "Codex app-server",
  },
  {
    attachmentsBeforeLaunch: true,
    createResponse: (signal: AbortSignal) =>
      streamCursorResponse({
        abortSignal: signal,
        authorizeHostAction: vi.fn(async () => true),
        messages,
        model: "cursor/test",
        modelSpeed: "standard",
        projectId: "project-1",
        projectPath: "/tmp",
        projectReferencesPrompt: null,
        remoteConversationId: null,
        remoteConversationModel: null,
        remoteConversationModelSpeed: null,
        remoteConversationProjectPath: null,
        responseMessageMetadata: {},
      }),
    launchMock: mocks.resolveCursorLaunch,
    name: "Cursor CLI",
  },
] as const;

describe("provider cancellation before spawn", () => {
  beforeEach(() => {
    mocks.prepareAttachments.mockReset();
    mocks.prepareAttachments.mockResolvedValue(null);
    mocks.resolveLaunch.mockReset();
    mocks.resolveLaunch.mockResolvedValue({
      argsPrefix: [],
      command: "provider-cli",
      shell: false,
    });
    mocks.resolveCursorLaunch.mockReset();
    mocks.resolveCursorLaunch.mockResolvedValue({
      argsPrefix: [],
      command: "provider-cli",
      shell: false,
    });
    mocks.spawn.mockReset();
  });

  for (const provider of providers) {
    it(`${provider.name} does not prepare attachments or spawn for a pre-aborted request`, async () => {
      const controller = new AbortController();
      controller.abort();

      await provider.createResponse(controller.signal).text();

      expect(mocks.prepareAttachments).not.toHaveBeenCalled();
      expect(provider.launchMock).not.toHaveBeenCalled();
      expect(mocks.spawn).not.toHaveBeenCalled();
    });

    it(`${provider.name} cleans delayed attachments and does not spawn after cancellation`, async () => {
      const attachments = createDeferred<{
        cleanup: () => void;
        promptText: string;
      } | null>();
      const cleanup = vi.fn();
      mocks.prepareAttachments.mockReturnValue(attachments.promise);
      const controller = new AbortController();
      const responseText = provider.createResponse(controller.signal).text();
      await vi.waitFor(() => {
        expect(mocks.prepareAttachments).toHaveBeenCalledOnce();
      });

      controller.abort();
      attachments.resolve({ cleanup, promptText: "attachment" });
      await responseText;
      await vi.waitFor(() => {
        expect(cleanup).toHaveBeenCalledOnce();
      });

      expect(mocks.spawn).not.toHaveBeenCalled();
    });

    it(`${provider.name} does not spawn when cancelled while launch resolution is pending`, async () => {
      const launch = createDeferred<{
        argsPrefix: string[];
        command: string;
        shell: boolean;
      }>();
      const cleanup = vi.fn();
      mocks.prepareAttachments.mockResolvedValue({
        cleanup,
        promptText: "attachment",
      });
      provider.launchMock.mockReturnValue(launch.promise);
      const controller = new AbortController();
      const responseText = provider.createResponse(controller.signal).text();
      await vi.waitFor(() => {
        expect(provider.launchMock).toHaveBeenCalledOnce();
      });

      controller.abort();
      launch.resolve({
        argsPrefix: [],
        command: "provider-cli",
        shell: false,
      });
      await responseText;
      await Promise.resolve();

      expect(mocks.spawn).not.toHaveBeenCalled();
      expect(cleanup).toHaveBeenCalledTimes(
        provider.attachmentsBeforeLaunch ? 1 : 0,
      );
    });

    it(`${provider.name} keeps prompts out of argv and ignores all post-abort process output`, async () => {
      const child = createChild();
      mocks.spawn.mockReturnValue(child);
      const controller = new AbortController();
      const responseText = provider.createResponse(controller.signal).text();

      await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledOnce());
      const spawnArgs = mocks.spawn.mock.calls[0]?.[1];
      expect(JSON.stringify(spawnArgs)).not.toContain(
        "CLY_PRIVATE_PROMPT_39d8",
      );
      expect(mocks.spawn.mock.calls[0]?.[2]).toMatchObject({ shell: false });

      if (provider.name === "Codex app-server") {
        child.stdout.emit(
          "data",
          Buffer.from(`${JSON.stringify({ id: 1, result: {} })}\n`),
        );
        await vi.waitFor(() =>
          expect(child.stdin.write.mock.calls.length).toBeGreaterThanOrEqual(2),
        );
        child.stdout.emit(
          "data",
          Buffer.from(
            `${JSON.stringify({
              id: 2,
              result: { thread: { id: "thread-safe" } },
            })}\n`,
          ),
        );
      }

      await vi.waitFor(() => {
        const stdinPayload = JSON.stringify([
          ...child.stdin.end.mock.calls,
          ...child.stdin.write.mock.calls,
        ]);
        expect(stdinPayload).toContain("CLY_PRIVATE_PROMPT_39d8");
      });

      controller.abort();
      child.stdout.emit(
        "data",
        Buffer.from(
          `${JSON.stringify({
            message: { text: "CLY_POST_ABORT_CANARY" },
            text: "CLY_POST_ABORT_CANARY",
            type: "assistant",
          })}\n`,
        ),
      );
      child.stderr.emit("data", Buffer.from("CLY_POST_ABORT_CANARY"));
      child.emit("error", new Error("CLY_POST_ABORT_CANARY"));
      child.emit("close", 1);

      await expect(responseText).resolves.not.toContain(
        "CLY_POST_ABORT_CANARY",
      );
      expect(child.stdout.listenerCount("data")).toBe(0);
      expect(child.stderr.listenerCount("data")).toBe(0);
    });
  }
});
