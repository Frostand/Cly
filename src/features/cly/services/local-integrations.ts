import { useIdeStore } from "../../../components/ide/ide-store";
import type { ProviderModelState } from "../../../components/ide/ide-types";
import { getDesktopApi } from "../../../lib/electron";
import type { AiProvider, DetectedEditor } from "../../../types/ide";
import type { StatusTone } from "../domain/types";

export interface LocalProviderDefinition {
  docsUrl: string;
  installCommand: string;
  loginCommand: string;
  name: string;
  provider: AiProvider;
  runtime: string;
}

export const localProviderDefinitions: readonly LocalProviderDefinition[] = [
  {
    docsUrl: "https://developers.openai.com/codex/cli/",
    installCommand: "npm install -g @openai/codex",
    loginCommand: "codex login",
    name: "Codex",
    provider: "openai",
    runtime: "Codex CLI",
  },
  {
    docsUrl: "https://docs.anthropic.com/en/docs/claude-code",
    installCommand: "npm install -g @anthropic-ai/claude-code",
    loginCommand: "claude",
    name: "Claude Code",
    provider: "anthropic",
    runtime: "Claude Code CLI",
  },
  {
    docsUrl: "https://opencode.ai/docs",
    installCommand: "npm install -g opencode-ai",
    loginCommand: "opencode auth login",
    name: "OpenCode",
    provider: "opencode",
    runtime: "OpenCode CLI",
  },
  {
    docsUrl: "https://cursor.com/docs/cli",
    installCommand: "curl https://cursor.com/install -fsS | bash",
    loginCommand: "cursor-agent login",
    name: "Cursor",
    provider: "cursor",
    runtime: "Cursor Agent CLI",
  },
] as const;

export type LocalProviderStatusKind =
  | "checking"
  | "connected"
  | "signed-out"
  | "not-installed"
  | "error";

export interface LocalProviderStatus {
  detail: string;
  kind: LocalProviderStatusKind;
  label: string;
  tone: StatusTone;
}

const authenticationErrorPattern =
  /(?:login not found|run `[^`]+` to fetch|not authenticated|not logged in|sign in)/i;

export function getLocalProviderStatus(
  state: ProviderModelState,
  hasFetched: boolean,
): LocalProviderStatus {
  if (!hasFetched || state.loading) {
    return {
      detail: "Checking the local CLI and its authenticated session.",
      kind: "checking",
      label: "Checking",
      tone: "neutral",
    };
  }

  if (!state.installed) {
    return {
      detail: state.error ?? "The CLI was not found on PATH.",
      kind: "not-installed",
      label: "Not installed",
      tone: "neutral",
    };
  }

  if (state.error && authenticationErrorPattern.test(state.error)) {
    return {
      detail: state.error,
      kind: "signed-out",
      label: "Signed out",
      tone: "warning",
    };
  }

  if (state.error) {
    return {
      detail: state.error,
      kind: "error",
      label: "Detection error",
      tone: "danger",
    };
  }

  if (state.models.length > 0) {
    return {
      detail: `${state.models.length} model${state.models.length === 1 ? "" : "s"} detected from the authenticated CLI.`,
      kind: "connected",
      label: "Connected",
      tone: "success",
    };
  }

  return {
    detail: "The CLI is installed, but it returned no usable models.",
    kind: "error",
    label: "Detection error",
    tone: "danger",
  };
}

export const localIntegrationService = {
  async refreshProvider(provider?: AiProvider) {
    await useIdeStore
      .getState()
      .refreshProviderModels({ force: true, provider });
  },

  async launchProviderLogin(provider: AiProvider) {
    const desktop = getDesktopApi();
    if (!desktop) {
      throw new Error(
        "Provider sign-in is available only in the Cly desktop app.",
      );
    }
    if (!(await desktop.launchProviderLogin(provider))) {
      throw new Error(
        "Cly could not open the provider sign-in terminal. Copy the sign-in command and run it manually.",
      );
    }
  },

  async copyCommand(command: string) {
    const desktop = getDesktopApi();
    if (desktop && (await desktop.writeClipboardText(command))) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(command);
      return;
    }
    throw new Error(
      "Clipboard access is unavailable. Select the command text to copy it.",
    );
  },

  async openDocumentation(url: string) {
    const desktop = getDesktopApi();
    if (!desktop || !(await desktop.openExternal(url))) {
      throw new Error("Cly could not open the provider documentation.");
    }
  },

  async detectEditors(): Promise<DetectedEditor[]> {
    const desktop = getDesktopApi();
    if (!desktop) return [];
    const detected = await desktop.detectEditors();
    return detected.filter(
      (editor) =>
        Boolean(editor.executable) &&
        !editor.isFileExplorer &&
        !editor.isTerminal,
    );
  },

  async openProjectInEditor(editorId: string, projectPath: string) {
    const desktop = getDesktopApi();
    if (!desktop || !(await desktop.openInEditor({ editorId, projectPath }))) {
      throw new Error(
        "Cly could not open this project in the selected editor.",
      );
    }
  },
};
