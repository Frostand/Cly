// @vitest-environment node
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
    parts: [{ text: "Inspect the project", type: "text" }],
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
        codexPermissionMode: "default",
        messages,
        model: "cursor/test",
        modelSpeed: "standard",
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
  }
});
