import {
  Code2,
  Copy,
  ExternalLink,
  LogIn,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useIdeStore } from "../../../components/ide/ide-store";
import type { ProviderModelState } from "../../../components/ide/ide-types";
import type { AiProvider, DetectedEditor } from "../../../types/ide";
import {
  Badge,
  Button,
  PageHeader,
  Panel,
  Section,
} from "../components/primitives";
import {
  getLocalProviderStatus,
  localIntegrationService,
  localProviderDefinitions,
} from "../services/local-integrations";
import { useClyStore } from "../store/cly-store";

type ProviderStateMap = Record<AiProvider, ProviderModelState>;

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export function IntegrationsScreen() {
  const providerModels = useIdeStore((state) => state.providerModels);
  const activeProject = useClyStore((state) =>
    state.data.projects.find((project) => project.id === state.activeProjectId),
  );
  const notify = useClyStore((state) => state.notify);
  const [editors, setEditors] = useState<DetectedEditor[]>([]);
  const [editorsLoading, setEditorsLoading] = useState(true);
  const [editorsError, setEditorsError] = useState<string | null>(null);
  const [loginErrors, setLoginErrors] = useState<
    Partial<Record<AiProvider, string>>
  >({});
  const [copiedProvider, setCopiedProvider] = useState<AiProvider | null>(null);

  const refreshEditors = useCallback(async () => {
    setEditorsLoading(true);
    setEditorsError(null);
    try {
      setEditors(await localIntegrationService.detectEditors());
    } catch (error) {
      setEditors([]);
      setEditorsError(
        errorMessage(error, "Cly could not detect external editors."),
      );
    } finally {
      setEditorsLoading(false);
    }
  }, []);

  useEffect(() => {
    void localIntegrationService.refreshProvider();
    void refreshEditors();
  }, [refreshEditors]);

  const connectedCount = useMemo(
    () =>
      localProviderDefinitions.filter(
        ({ provider }) =>
          getLocalProviderStatus(
            (providerModels as ProviderStateMap)[provider],
            providerModels.fetchedAt !== null,
          ).kind === "connected",
      ).length,
    [providerModels],
  );

  const refreshAll = async () => {
    await Promise.all([
      localIntegrationService.refreshProvider(),
      refreshEditors(),
    ]);
  };

  const launchLogin = async (provider: AiProvider, name: string) => {
    setLoginErrors((current) => ({ ...current, [provider]: undefined }));
    try {
      await localIntegrationService.launchProviderLogin(provider);
      notify(`${name} sign-in opened`, "Finish sign-in, then refresh status.");
    } catch (error) {
      setLoginErrors((current) => ({
        ...current,
        [provider]: errorMessage(error, `Cly could not open ${name} sign-in.`),
      }));
    }
  };

  const copyCommand = async (provider: AiProvider, command: string) => {
    try {
      await localIntegrationService.copyCommand(command);
      setCopiedProvider(provider);
      window.setTimeout(() => setCopiedProvider(null), 1_600);
    } catch (error) {
      notify(
        "Command was not copied",
        errorMessage(error, "Clipboard access is unavailable."),
      );
    }
  };

  const openEditor = async (editor: DetectedEditor) => {
    if (!activeProject?.path) return;
    try {
      await localIntegrationService.openProjectInEditor(
        editor.id,
        activeProject.path,
      );
    } catch (error) {
      notify(
        `${editor.name} did not open`,
        errorMessage(error, "The project could not be opened."),
      );
    }
  };

  return (
    <div className="cly-page cly-page-wide cly-route-integrations">
      <PageHeader
        kicker="System"
        title="Integrations & Providers"
        description="Use authenticated local AI harnesses and detected editors. Cly does not accept or store provider API keys."
        actions={
          <Button
            onClick={() => void refreshAll()}
            disabled={providerModels.openai.loading || editorsLoading}
          >
            <RefreshCw size={13} aria-hidden="true" /> Refresh all
          </Button>
        }
      />

      <Section
        title="Local AI providers"
        subtitle={`${connectedCount} of ${localProviderDefinitions.length} connected`}
      >
        <Panel className="cly-local-integration-list">
          {localProviderDefinitions.map((definition) => {
            const state = (providerModels as ProviderStateMap)[
              definition.provider
            ];
            const status = getLocalProviderStatus(
              state,
              providerModels.fetchedAt !== null,
            );
            const setupCommand =
              status.kind === "not-installed"
                ? definition.installCommand
                : definition.loginCommand;
            const copyLabel =
              status.kind === "not-installed"
                ? `Copy ${definition.name} install command`
                : `Copy ${definition.name} sign-in command`;
            return (
              <div
                className="cly-local-integration-row"
                key={definition.provider}
                data-provider={definition.provider}
              >
                <div className="cly-local-integration-identity">
                  <span className="cly-project-mark">
                    <Code2 size={14} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>{definition.name}</strong>
                    <span>{definition.runtime}</span>
                  </div>
                </div>
                <div className="cly-local-integration-status">
                  <Badge tone={status.tone}>{status.label}</Badge>
                  <span>{status.detail}</span>
                  {state.version ? (
                    <small>Version {state.version}</small>
                  ) : null}
                  {status.kind === "connected" ? (
                    <small className="cly-local-integration-models">
                      {state.models
                        .slice(0, 3)
                        .map((model) => model.label)
                        .join(" · ")}
                      {state.models.length > 3
                        ? ` · +${state.models.length - 3} more`
                        : ""}
                    </small>
                  ) : null}
                  {loginErrors[definition.provider] ? (
                    <small className="cly-local-integration-error" role="alert">
                      {loginErrors[definition.provider]}
                    </small>
                  ) : null}
                </div>
                <code className="cly-local-integration-command">
                  {setupCommand}
                </code>
                <div className="cly-local-integration-actions">
                  {status.kind === "signed-out" ? (
                    <Button
                      variant="primary"
                      aria-label={`Sign in to ${definition.name}`}
                      onClick={() =>
                        void launchLogin(definition.provider, definition.name)
                      }
                    >
                      <LogIn size={13} aria-hidden="true" /> Sign in
                    </Button>
                  ) : null}
                  <Button
                    aria-label={`Refresh ${definition.name}`}
                    disabled={state.loading}
                    onClick={() =>
                      void localIntegrationService.refreshProvider(
                        definition.provider,
                      )
                    }
                  >
                    <RefreshCw size={13} aria-hidden="true" /> Refresh
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={copyLabel}
                    onClick={() =>
                      void copyCommand(definition.provider, setupCommand)
                    }
                  >
                    <Copy size={13} aria-hidden="true" />
                    {copiedProvider === definition.provider ? "Copied" : "Copy"}
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`Open ${definition.name} documentation`}
                    onClick={() =>
                      void localIntegrationService
                        .openDocumentation(definition.docsUrl)
                        .catch((error) =>
                          notify(
                            "Documentation did not open",
                            errorMessage(
                              error,
                              "The link could not be opened.",
                            ),
                          ),
                        )
                    }
                  >
                    <ExternalLink size={13} aria-hidden="true" /> Docs
                  </Button>
                </div>
              </div>
            );
          })}
        </Panel>
      </Section>

      <Section
        title="Detected editors"
        subtitle="Editors available for opening the active project"
        actions={
          <Button
            onClick={() => void refreshEditors()}
            disabled={editorsLoading}
          >
            <RefreshCw size={13} aria-hidden="true" /> Refresh
          </Button>
        }
      >
        <Panel className="cly-local-editor-list">
          {editorsLoading ? (
            <div className="cly-local-integration-message" role="status">
              Detecting editors…
            </div>
          ) : editorsError ? (
            <div className="cly-local-integration-message" role="alert">
              <span>{editorsError}</span>
              <Button onClick={() => void refreshEditors()}>Try again</Button>
            </div>
          ) : editors.length === 0 ? (
            <div className="cly-local-integration-message" role="status">
              No external editors detected
            </div>
          ) : (
            editors.map((editor) => (
              <div className="cly-local-editor-row" key={editor.id}>
                <div>
                  <Code2 size={14} aria-hidden="true" />
                  <strong>{editor.name}</strong>
                </div>
                <Badge tone="success">Detected</Badge>
                <Button
                  aria-label={`Open project in ${editor.name}`}
                  disabled={!activeProject?.path}
                  title={
                    activeProject?.path
                      ? undefined
                      : "Create or open a project before opening an editor."
                  }
                  onClick={() => void openEditor(editor)}
                >
                  Open project
                </Button>
              </div>
            ))
          )}
        </Panel>
      </Section>

      <div className="cly-callout cly-local-integration-boundary">
        <ShieldCheck size={15} aria-hidden="true" />
        <div>
          <strong>Local integration boundary</strong>
          <span>
            Hosted literature, data, billing, managed-credit, and API-key
            integrations are not shipped. Provider prompts and approved context
            follow the terms of the signed-in CLI account.
          </span>
        </div>
      </div>
    </div>
  );
}
