import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIdeStore } from "../../../components/ide/ide-store";
import type { ProviderModelState } from "../../../components/ide/ide-types";
import type { DesktopApi } from "../../../types/ide";
import { createFixtureRepository } from "../fixtures/repository";
import { getLocalProviderStatus } from "../services/local-integrations";
import { useClyStore } from "../store/cly-store";
import { IntegrationsScreen } from "./integrations";

const providerState = (
  patch: Partial<ProviderModelState> = {},
): ProviderModelState => ({
  error: null,
  installed: false,
  loading: false,
  models: [],
  source: "unavailable",
  version: null,
  ...patch,
});

const connected = providerState({
  installed: true,
  models: [{ id: "gpt-5.6-codex", label: "GPT-5.6 Codex" }],
  source: "cli",
  version: "0.144.6",
});
const signedOut = providerState({
  error: "Claude Code login not found. Run `claude` and sign in, then refresh.",
  installed: true,
  version: "2.1.0",
});
const notInstalled = providerState({
  error: "OpenCode CLI is not installed or not available on PATH.",
});
const detectionError = providerState({
  error: "Cursor model discovery failed.",
  installed: true,
  version: "1.4.0",
});

const setProviderModels = (
  refreshProviderModels = vi.fn().mockResolvedValue(undefined),
) => {
  useIdeStore.setState({
    providerModels: {
      anthropic: signedOut,
      cursor: detectionError,
      fetchedAt: "2026-07-24T12:00:00.000Z",
      openai: connected,
      opencode: notInstalled,
    },
    refreshProviderModels,
  });
  return refreshProviderModels;
};

const installDesktop = (patch: Partial<DesktopApi> = {}) => {
  const desktop = {
    detectEditors: vi.fn().mockResolvedValue([
      {
        executable: "/Applications/Visual Studio Code.app/bin/code",
        id: "vscode",
        isFileExplorer: false,
        isTerminal: false,
        name: "VS Code",
      },
      {
        executable: "/usr/bin/open",
        id: "file-explorer",
        isFileExplorer: true,
        isTerminal: false,
        name: "Finder",
      },
    ]),
    isElectron: true as const,
    launchProviderLogin: vi.fn().mockResolvedValue(true),
    openExternal: vi.fn().mockResolvedValue(true),
    openInEditor: vi.fn().mockResolvedValue(true),
    writeClipboardText: vi.fn().mockResolvedValue(true),
    ...patch,
  } as unknown as DesktopApi;
  Object.defineProperty(window, "dream", {
    configurable: true,
    value: desktop,
  });
  return desktop;
};

describe("local integration status", () => {
  it.each([
    [connected, "connected"],
    [signedOut, "signed-out"],
    [notInstalled, "not-installed"],
    [detectionError, "error"],
  ] as const)("classifies real provider state as %s", (state, kind) => {
    expect(getLocalProviderStatus(state, true).kind).toBe(kind);
  });

  it("does not report initial or refreshing state as unavailable", () => {
    expect(getLocalProviderStatus(notInstalled, false).kind).toBe("checking");
    expect(
      getLocalProviderStatus({ ...connected, loading: true }, true).kind,
    ).toBe("checking");
  });
});

describe("IntegrationsScreen", () => {
  beforeEach(() => {
    const data = createFixtureRepository("active");
    useClyStore.setState({
      activeProjectId: data.projects[0].id,
      data,
      toasts: [],
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "dream", {
      configurable: true,
      value: undefined,
    });
    vi.restoreAllMocks();
  });

  it("renders detected provider truth without the preview marketplace", async () => {
    setProviderModels();
    installDesktop();
    render(<IntegrationsScreen />);

    expect(screen.getByText("1 of 4 connected")).toBeVisible();
    expect(screen.getByText("Connected")).toBeVisible();
    expect(screen.getByText("Signed out")).toBeVisible();
    expect(screen.getByText("Not installed")).toBeVisible();
    expect(screen.getByText("Detection error")).toBeVisible();
    expect(screen.getByText("GPT-5.6 Codex")).toBeVisible();
    expect(await screen.findByText("VS Code")).toBeVisible();

    expect(screen.queryByText("NotebookLM")).not.toBeInTheDocument();
    expect(screen.queryByText("Managed credits")).not.toBeInTheDocument();
    expect(screen.queryByText("Bring your own key")).not.toBeInTheDocument();
    expect(screen.queryByText(/sk-proj/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Preview/i)).not.toBeInTheDocument();
  });

  it("refreshes, signs in, copies setup, and opens detected editors through real boundaries", async () => {
    const refresh = setProviderModels();
    const desktop = installDesktop();
    const user = userEvent.setup();
    render(<IntegrationsScreen />);

    await user.click(screen.getByRole("button", { name: "Refresh Codex" }));
    expect(refresh).toHaveBeenCalledWith({ force: true, provider: "openai" });

    await user.click(
      screen.getByRole("button", { name: "Sign in to Claude Code" }),
    );
    expect(desktop.launchProviderLogin).toHaveBeenCalledWith("anthropic");

    await user.click(
      screen.getByRole("button", {
        name: "Copy OpenCode install command",
      }),
    );
    expect(desktop.writeClipboardText).toHaveBeenCalledWith(
      "npm install -g opencode-ai",
    );

    await user.click(
      await screen.findByRole("button", { name: "Open project in VS Code" }),
    );
    expect(desktop.openInEditor).toHaveBeenCalledWith({
      projectId: "project-cly",
      editorId: "vscode",
      projectPath: useClyStore.getState().data.projects[0].path,
    });
  });

  it("shows editor and secure sign-in launch failures", async () => {
    setProviderModels();
    installDesktop({
      detectEditors: vi
        .fn()
        .mockRejectedValue(new Error("Editor scan failed.")),
      launchProviderLogin: vi.fn().mockResolvedValue(false),
    });
    const user = userEvent.setup();
    render(<IntegrationsScreen />);

    expect(await screen.findByText("Editor scan failed.")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Sign in to Claude Code" }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/could not open the provider sign-in terminal/i),
      ).toBeVisible(),
    );
  });
});
