import {
  ArrowDown,
  ArrowUp,
  Check,
  CircleDollarSign,
  Cloud,
  Code2,
  Copy,
  Cpu,
  HardDrive,
  KeyRound,
  Laptop,
  PanelRightOpen,
  Play,
  Plus,
  RotateCcw,
  Save,
  Shield,
  Trash2,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";
import { getDesktopApi } from "../../../lib/electron";
import type {
  AgentConfiguration,
  AgentConfigurationEstimate,
  AgentConfigurationInput,
  AgentRoleConfiguration,
} from "../agent-sessions/types";
import { DisclosureRow } from "../components/design-system";
import {
  Badge,
  Button,
  EmptyState,
  Metric,
  PageHeader,
  Panel,
  Section,
  Segmented,
  Toggle,
  toneForStatus,
} from "../components/primitives";
import type { AgentPreset } from "../domain/types";
import { capabilityUnavailableMessage } from "../services/capabilities";
import { projectServices } from "../services/project-services";
import { isClyDemoRuntime } from "../services/runtime";
import { useClyStore } from "../store/cly-store";

const providerIcon = (name: string) =>
  name.includes("Git")
    ? Code2
    : name.includes("Docker") || name.includes("Conda")
      ? Cpu
      : name.includes("folder")
        ? HardDrive
        : Cloud;

const resourceBudget = {
  maxInputTokens: 32_000,
  maxOutputTokens: 8_000,
  maxCostMinorUnits: 500,
  maxRuntimeMs: 2_700_000,
};

type HarnessId = "openai" | "anthropic" | "opencode" | "cursor";
type HarnessState = {
  error: string | null;
  installed: boolean;
  loading: boolean;
  models: Array<{ id: string; label: string }>;
};

const HARNESS_ORDER: HarnessId[] = [
  "anthropic",
  "openai",
  "opencode",
  "cursor",
];

const HARNESS_META: Record<
  HarnessId,
  { command: string; label: string; runtime: string }
> = {
  anthropic: {
    command: "claude  # then run /login",
    label: "Claude Code",
    runtime: "Claude Code CLI",
  },
  cursor: {
    command: "agent login",
    label: "Cursor",
    runtime: "Cursor Agent CLI",
  },
  openai: {
    command: "codex login",
    label: "Codex",
    runtime: "Codex CLI",
  },
  opencode: {
    command: "opencode auth login",
    label: "OpenCode",
    runtime: "OpenCode CLI",
  },
};

const emptyHarnessState: HarnessState = {
  error: null,
  installed: false,
  loading: false,
  models: [],
};

const DEMO_HARNESS_MODELS: Record<HarnessId, HarnessState["models"]> = {
  anthropic: [{ id: "claude-sonnet-demo", label: "Claude Sonnet (demo)" }],
  cursor: [{ id: "cursor-agent-demo", label: "Cursor Agent (demo)" }],
  openai: [{ id: "gpt-demo", label: "GPT (demo)" }],
  opencode: [{ id: "opencode-demo", label: "OpenCode (demo)" }],
};

function HarnessesPanel() {
  const [active, setActive] = useState<HarnessId>("anthropic");
  const [states, setStates] = useState<Record<HarnessId, HarnessState>>({
    anthropic: emptyHarnessState,
    cursor: emptyHarnessState,
    openai: emptyHarnessState,
    opencode: emptyHarnessState,
  });
  const [loginStarted, setLoginStarted] = useState(false);
  const refresh = useCallback(async (provider: HarnessId) => {
    if (__CLY_INCLUDE_DEMOS__ && isClyDemoRuntime) {
      setStates((current) => ({
        ...current,
        [provider]: {
          error: null,
          installed: true,
          loading: false,
          models: DEMO_HARNESS_MODELS[provider],
        },
      }));
      return;
    }

    setStates((current) => ({
      ...current,
      [provider]: { ...current[provider], loading: true },
    }));
    try {
      const response = await fetch("/api/provider-models", {
        body: JSON.stringify({ force: true, provider }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error("Unable to check this harness.");
      const body = (await response.json()) as Partial<
        Record<
          HarnessId,
          Omit<HarnessState, "loading" | "error"> & { error?: string }
        >
      >;
      const result = body[provider];
      setStates((current) => ({
        ...current,
        [provider]: {
          error: result?.error ?? null,
          installed: result?.installed ?? false,
          loading: false,
          models: result?.models ?? [],
        },
      }));
    } catch (error) {
      setStates((current) => ({
        ...current,
        [provider]: {
          ...current[provider],
          error:
            error instanceof Error
              ? error.message
              : "Unable to check this harness.",
          loading: false,
        },
      }));
    }
  }, []);

  useEffect(() => {
    void refresh(active);
  }, [active, refresh]);

  const state = states[active];
  const meta = HARNESS_META[active];
  const connected = state.installed && !state.error && state.models.length > 0;
  const launchLogin = async () => {
    const started = await getDesktopApi()?.launchProviderLogin(active);
    if (started) setLoginStarted(true);
  };

  return (
    <Section
      title="Harnesses"
      subtitle="Connect the local AI tools that Cly can run in your projects."
      actions={
        <Button disabled={state.loading} onClick={() => void refresh(active)}>
          <RotateCcw size={13} /> Refresh
        </Button>
      }
    >
      <div className="cly-harnesses">
        <div
          className="cly-harness-tabs"
          role="tablist"
          aria-label="AI harnesses"
        >
          {HARNESS_ORDER.map((provider) => (
            <button
              type="button"
              key={provider}
              role="tab"
              aria-selected={active === provider}
              onClick={() => {
                setActive(provider);
                setLoginStarted(false);
              }}
            >
              {HARNESS_META[provider].label}
            </button>
          ))}
        </div>
        <div className="cly-harness-content" role="tabpanel">
          <div className="cly-row-between">
            <div>
              <strong>Authentication</strong>
              <p className="cly-muted cly-small">
                Cly uses the existing {meta.runtime} session. Credentials stay
                with the harness.
              </p>
            </div>
            <Badge tone={connected ? "success" : "warning"}>
              {connected
                ? `${state.models.length} models available`
                : "Sign-in required"}
            </Badge>
          </div>
          <div className="cly-harness-auth-choice">
            <div data-selected="true">
              <KeyRound size={15} />
              <span>
                <strong>CLI</strong>
                <small>Use the account signed into {meta.runtime}.</small>
              </span>
            </div>
            <div>
              <KeyRound size={15} />
              <span>
                <strong>API key</strong>
                <small>Configure it in the provider harness.</small>
              </span>
            </div>
          </div>
          {!connected ? (
            <div className="cly-callout" data-tone="warning">
              {state.error ?? `Sign in to ${meta.label}, then refresh.`}
            </div>
          ) : null}
          {loginStarted ? (
            <p className="cly-muted cly-small">
              Finish signing in in Terminal, then refresh this harness.
            </p>
          ) : null}
          <div className="cly-row" style={{ marginTop: 12 }}>
            <Button variant="primary" onClick={() => void launchLogin()}>
              Sign in with {meta.label}
            </Button>
            <Button
              onClick={() => void navigator.clipboard.writeText(meta.command)}
            >
              <Copy size={13} /> Copy command
            </Button>
          </div>
          <div className="cly-harness-models">
            <strong>Available models</strong>
            {state.models.length ? (
              state.models.map((model) => (
                <div className="cly-list-row" key={model.id}>
                  {model.label}
                </div>
              ))
            ) : (
              <p className="cly-muted cly-small">
                Sign in, then refresh to load models.
              </p>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

const inferRole = (label: string): AgentRoleConfiguration["role"] => {
  const normalized = label.toLowerCase();
  if (normalized.includes("review")) return "review";
  if (normalized.includes("literature") || normalized.includes("research"))
    return "literature";
  if (normalized.includes("analysis")) return "analysis";
  if (normalized.includes("experiment")) return "experiment";
  if (normalized.includes("orchestrat") || normalized.includes("synth"))
    return "orchestrator";
  return "implementation";
};

const configurationFromPreset = (
  preset: AgentPreset | undefined,
): AgentConfigurationInput => {
  const roles = (preset?.nodes ?? []).map((node, index) => ({
    id: `${inferRole(node.role)}-${index + 1}`,
    role: inferRole(node.role),
    instanceCount: 1,
    maxParallel: 1,
    provider: node.model.includes("Claude") ? "anthropic" : "openai",
    model: node.model,
    reasoningLevel: node.reasoning.toLowerCase() as "low" | "medium" | "high",
    budget: { ...resourceBudget },
    allowedTools: node.canModifyFiles
      ? ["readFile", "writeFile", "runCommand"]
      : ["readFile"],
    allowedContextSources: [node.contextPack],
    allowedFileGlobs: ["**/*"],
    permissions: {
      canReadFiles: true,
      canWriteFiles: node.canModifyFiles,
      canRunCommands: node.canModifyFiles,
      canAccessNetwork: false,
      requiresApprovalForWrite: node.approvalRequired,
      requiresApprovalForNetwork: true,
    },
    approvalCheckpoints: node.approvalRequired ? ["write"] : [],
    fallbackModel: "Claude Sonnet",
  }));
  const safeRoles = roles.length
    ? roles
    : [
        {
          id: "implementation-1",
          role: "implementation" as const,
          instanceCount: 1,
          maxParallel: 1,
          provider: "openai",
          model: "GPT-5",
          reasoningLevel: "medium" as const,
          budget: { ...resourceBudget },
          allowedTools: ["readFile"],
          allowedContextSources: ["project"],
          allowedFileGlobs: ["**/*"],
          permissions: {
            canReadFiles: true,
            canWriteFiles: false,
            canRunCommands: false,
            canAccessNetwork: false,
            requiresApprovalForWrite: true,
            requiresApprovalForNetwork: true,
          },
          approvalCheckpoints: ["write"],
          fallbackModel: "Claude Sonnet",
        },
      ];
  return {
    name: preset?.name ?? "Project agent configuration",
    maxParallel: safeRoles.reduce((total, role) => total + role.maxParallel, 0),
    maxTotalBudget: {
      maxInputTokens: 128_000,
      maxOutputTokens: 32_000,
      maxCostMinorUnits: 2_000,
      maxRuntimeMs: 7_200_000,
    },
    partialFailurePolicy: "continue",
    roles: safeRoles,
  };
};

const configurationInput = (
  configuration: AgentConfiguration | AgentConfigurationInput,
): AgentConfigurationInput => ({
  name: configuration.name,
  maxParallel: configuration.maxParallel,
  maxTotalBudget: configuration.maxTotalBudget,
  partialFailurePolicy: configuration.partialFailurePolicy,
  roles: configuration.roles,
});

const commaList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const emptyAgentConfigurations: AgentConfiguration[] = [];

export function IntegrationsScreen() {
  const integrations = useClyStore((s) => s.data.integrations);
  const setSelected = useClyStore((s) => s.setSelected);
  const notify = useClyStore((s) => s.notify);
  const [category, setCategory] = useState("All");
  const visible = integrations.filter(
    (item) => category === "All" || item.category === category,
  );
  return (
    <div className="cly-page cly-page-wide cly-route-integrations">
      <PageHeader
        kicker="System"
        title="Integrations & Providers"
        description="Manage local and permissioned research tools."
        actions={
          <Segmented
            value={category}
            options={
              [
                "All",
                "Research",
                "Code",
                "Data",
                "Writing",
                "Runtime",
                "Local",
              ] as const
            }
            onChange={setCategory}
            label="Integration category"
          />
        }
      />
      <Section
        title="Integration catalog"
        subtitle={capabilityUnavailableMessage("integrations.configure")}
      >
        {visible.length === 0 ? (
          <EmptyState
            title="No integration providers are configured"
            description={capabilityUnavailableMessage("integrations.configure")}
          />
        ) : (
          <div className="cly-integration-catalog">
            {visible.map((integration) => {
              const Icon = providerIcon(integration.name);
              return (
                <Panel key={integration.id}>
                  <div className="cly-panel-body">
                    <div className="cly-row-between">
                      <div className="cly-row">
                        <span className="cly-project-mark">
                          <Icon size={14} />
                        </span>
                        <div>
                          <strong>{integration.name}</strong>
                          <div className="cly-faint cly-small">
                            {integration.category}
                          </div>
                        </div>
                      </div>
                      <Badge tone={toneForStatus(integration.status)}>
                        {integration.status}
                      </Badge>
                    </div>
                    <p
                      className="cly-muted cly-small"
                      style={{ minHeight: 32, lineHeight: 1.45 }}
                    >
                      {integration.purpose}
                    </p>
                    <div className="cly-row" style={{ flexWrap: "wrap" }}>
                      {integration.capabilities.map((capability) => (
                        <span
                          className="cly-inline-capability"
                          key={capability}
                        >
                          {capability}
                        </span>
                      ))}
                    </div>
                    <div className="cly-divider" style={{ margin: "11px 0" }} />
                    <div className="cly-row-between">
                      <span className="cly-faint" style={{ fontSize: 9 }}>
                        {integration.privacy}
                      </span>
                      <div className="cly-row">
                        <Button
                          variant="ghost"
                          aria-label={`View ${integration.name} details`}
                          onClick={() => setSelected(integration.id)}
                        >
                          <PanelRightOpen size={13} /> Details
                        </Button>
                        <Button
                          disabled={!isClyDemoRuntime}
                          title={
                            isClyDemoRuntime
                              ? undefined
                              : capabilityUnavailableMessage(
                                  "integrations.configure",
                                )
                          }
                          onClick={() => {
                            if (integration.status === "Connected")
                              notify(
                                `${integration.name} settings`,
                                "Permissions and project scope are shown in the inspector.",
                              );
                            else
                              void projectServices.integrations
                                .updateStatus(integration.id, "Setup required")
                                .then(() =>
                                  notify(
                                    `${integration.name} setup`,
                                    "Real connection is unavailable in the UI prototype.",
                                  ),
                                );
                          }}
                        >
                          {integration.status === "Connected"
                            ? "Manage"
                            : "Setup"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </Panel>
              );
            })}
          </div>
        )}
      </Section>
      <DisclosureRow
        title="Connection modes"
        detail="Local subscriptions, provider keys, and managed credits"
      >
        <div className="cly-grid-3">
          <Panel>
            <div className="cly-panel-header">
              <div className="cly-row">
                <Laptop size={15} />
                <strong>Local subscription mode</strong>
              </div>
              <Badge tone="success">Preferred</Badge>
            </div>
            <div className="cly-panel-body cly-stack">
              {[
                "Codex",
                "Claude Code",
                "codex-plugin-cc",
                "Optional local tools",
              ].map((name, index) => (
                <div className="cly-row-between" key={name}>
                  <span>{name}</span>
                  <Badge
                    tone={
                      index < 2
                        ? "success"
                        : index === 2
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {index < 2
                      ? "Installed"
                      : index === 2
                        ? "Manual setup"
                        : "Optional"}
                  </Badge>
                </div>
              ))}
              <p className="cly-muted cly-small">
                Uses signed-in local CLIs when available. No API key is required
                by Cly.
              </p>
            </div>
          </Panel>
          <Panel>
            <div className="cly-panel-header">
              <div className="cly-row">
                <KeyRound size={15} />
                <strong>Bring your own key</strong>
              </div>
              <Badge>Optional</Badge>
            </div>
            <div className="cly-panel-body cly-stack">
              {[
                "OpenAI · sk-proj-••••••12",
                "Anthropic · sk-ant-••••••71",
                "Google Gemini · ••••••93",
                "Compatible provider",
              ].map((name) => (
                <div className="cly-row-between" key={name}>
                  <span>{name}</span>
                  <Button
                    disabled={!isClyDemoRuntime}
                    title={capabilityUnavailableMessage(
                      "integrations.configure",
                    )}
                    onClick={() =>
                      notify(
                        "Prototype credential",
                        "Fake masked values are never persisted or sent over the network.",
                      )
                    }
                  >
                    Configure
                  </Button>
                </div>
              ))}
              <div className="cly-callout" data-tone="warning">
                Real secrets are not accepted or stored in this phase.
              </div>
            </div>
          </Panel>
          <Panel>
            <div className="cly-panel-header">
              <div className="cly-row">
                <CircleDollarSign size={15} />
                <strong>Managed credits</strong>
              </div>
              <Badge>Planned</Badge>
            </div>
            <div className="cly-panel-body">
              <div className="cly-metric-row">
                <Metric label="Plan" value="—" />
                <Metric label="Credits" value="—" />
              </div>
              <p className="cly-muted cly-small">
                Billing, team plans, included credits, limits, and upgrades are
                intentionally unavailable.
              </p>
              <Button
                disabled
                title="Managed credits are planned for a future phase"
              >
                Unavailable
              </Button>
            </div>
          </Panel>
        </div>
      </DisclosureRow>
      <DisclosureRow
        title="Routing preferences"
        detail="Defaults, fallbacks, privacy, and usage"
      >
        <Panel className="cly-panel-body">
          <div className="cly-grid-3">
            {[
              ["Default research model", "Codex · GPT-5"],
              ["Default code model", "Codex · GPT-5"],
              ["Default review model", "Claude Sonnet"],
              ["Fallback order", "Local → subscription → API"],
              ["Privacy restriction", "No source text to cloud"],
              ["Maximum usage", "High"],
            ].map(([label, value]) => (
              <div className="cly-field" key={label}>
                <span className="cly-muted cly-small">{label}</span>
                <button
                  className="cly-input"
                  type="button"
                  disabled={!isClyDemoRuntime}
                  title={capabilityUnavailableMessage("integrations.configure")}
                  onClick={() =>
                    notify("Routing preference", `${label}: ${value}`)
                  }
                  style={{ textAlign: "left" }}
                >
                  {value}
                </button>
              </div>
            ))}
          </div>
          <label className="cly-row cly-small" style={{ marginTop: 13 }}>
            <input type="checkbox" defaultChecked className="cly-checkbox" />{" "}
            Prefer local subscription routes when available
          </label>
        </Panel>
      </DisclosureRow>
    </div>
  );
}

export function ModelsAgentsScreen() {
  const presets = useClyStore((s) => s.data.agentPresets);
  const storedConfigurations = useClyStore((s) => s.data.agentConfigurations);
  const configurations = storedConfigurations ?? emptyAgentConfigurations;
  const activeProjectId = useClyStore((s) => s.activeProjectId);
  const notify = useClyStore((s) => s.notify);
  const [selectedPresetId, setSelectedPresetId] = useState(
    presets[1]?.id ?? presets[0]?.id,
  );
  const original =
    presets.find((item) => item.id === selectedPresetId) ?? presets[0];
  const [advanced, setAdvanced] = useState(false);
  const [showAllPresets, setShowAllPresets] = useState(false);
  const [configuration, setConfiguration] = useState<
    AgentConfiguration | AgentConfigurationInput
  >(() => configurations[0] ?? configurationFromPreset(original));
  const [estimate, setEstimate] = useState<AgentConfigurationEstimate | null>(
    null,
  );
  const [estimateReviewed, setEstimateReviewed] = useState(false);
  const [adoptHydratedConfiguration, setAdoptHydratedConfiguration] = useState(
    configurations.length === 0,
  );
  const previousProjectId = useRef(activeProjectId);

  useEffect(() => {
    if (previousProjectId.current !== activeProjectId) {
      previousProjectId.current = activeProjectId;
      setConfiguration(configurationFromPreset(original));
      setEstimate(null);
      setEstimateReviewed(false);
      setAdoptHydratedConfiguration(true);
      return;
    }
    if (adoptHydratedConfiguration && configurations[0]) {
      setConfiguration(configurations[0]);
      setAdoptHydratedConfiguration(false);
    }
  }, [activeProjectId, adoptHydratedConfiguration, configurations, original]);

  const updateConfiguration = (
    updater: (
      current: AgentConfiguration | AgentConfigurationInput,
    ) => AgentConfiguration | AgentConfigurationInput,
  ) => {
    setAdoptHydratedConfiguration(false);
    setConfiguration(updater);
    setEstimate(null);
    setEstimateReviewed(false);
  };

  const updateRoleConfiguration = (
    roleId: string,
    updater: (role: AgentRoleConfiguration) => AgentRoleConfiguration,
  ) =>
    updateConfiguration((current) => ({
      ...current,
      roles: current.roles.map((role) =>
        role.id === roleId ? updater(role) : role,
      ),
    }));

  const choosePreset = (preset: AgentPreset) => {
    setSelectedPresetId(preset.id);
    setAdoptHydratedConfiguration(false);
    setConfiguration(configurationFromPreset(preset));
    setEstimate(null);
    setEstimateReviewed(false);
  };
  const moveRole = (index: number, direction: -1 | 1) =>
    updateConfiguration((current) => {
      const next = [...current.roles];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, roles: next };
    });
  const save = async () => {
    try {
      const input = configurationInput(configuration);
      if (!estimateReviewed) {
        const nextEstimate = await projectServices.agents.estimateConfiguration(
          activeProjectId,
          "id" in configuration ? configuration.id : "draft",
          input,
        );
        setEstimate(nextEstimate);
        setEstimateReviewed(true);
        notify(
          "Review the configuration estimate",
          "Confirm numeric limits and any inaccessible tools or context before saving.",
        );
        return;
      }
      const persisted = await projectServices.agents.saveConfiguration(
        activeProjectId,
        configuration,
      );
      setConfiguration(persisted);
      setAdoptHydratedConfiguration(false);
      setEstimateReviewed(false);
      notify(
        "Agent configuration saved",
        `${persisted.name} revision ${persisted.revision}.`,
      );
    } catch (error) {
      notify(
        "Agent configuration was not saved",
        error instanceof Error
          ? error.message
          : "Unable to save the agent configuration.",
      );
    }
  };
  const remove = async () => {
    if (!("id" in configuration)) return;
    try {
      await projectServices.agents.removeConfiguration(
        activeProjectId,
        configuration.id,
        configuration.revision,
      );
      setConfiguration(configurationFromPreset(original));
      setAdoptHydratedConfiguration(false);
      setEstimate(null);
      setEstimateReviewed(false);
      notify("Agent configuration deleted", configuration.name);
    } catch (error) {
      notify(
        "Agent configuration was not deleted",
        error instanceof Error
          ? error.message
          : "Unable to delete the agent configuration.",
      );
    }
  };

  return (
    <div className="cly-page cly-page-wide cly-route-models">
      <PageHeader
        kicker="System"
        title="Models & Agents"
        description="Choose a preset, then adjust roles, models, and limits."
        actions={
          <>
            {"id" in configuration ? (
              <Button variant="ghost" onClick={() => void remove()}>
                <Trash2 size={13} /> Delete configuration
              </Button>
            ) : null}
            <Button
              onClick={() => {
                setConfiguration(configurationFromPreset(original));
                setAdoptHydratedConfiguration(false);
                setEstimate(null);
                setEstimateReviewed(false);
                notify("Plan reset to recommended");
              }}
            >
              <RotateCcw size={13} /> Reset
            </Button>
            <Button variant="primary" onClick={() => void save()}>
              <Save size={13} />
              {estimateReviewed ? "Save configuration" : "Review estimate"}
            </Button>
          </>
        }
      />
      <HarnessesPanel />
      <Section
        title="Project configurations"
        subtitle="Durable, revisioned agent plans for the active project"
      >
        {configurations.length ? (
          <div className="cly-preset-list">
            {configurations.map((item) => (
              <button
                type="button"
                className="cly-preset-row"
                key={item.id}
                data-selected={
                  "id" in configuration && configuration.id === item.id
                }
                onClick={() => {
                  setConfiguration(item);
                  setEstimate(null);
                  setEstimateReviewed(false);
                }}
                style={{ textAlign: "left", color: "inherit" }}
              >
                <div className="cly-row-between">
                  <strong>{item.name}</strong>
                  <Badge tone="success">Revision {item.revision}</Badge>
                </div>
                <p className="cly-muted cly-small">
                  {item.roles.length} roles · {item.maxParallel} global parallel
                </p>
                <div className="cly-faint cly-small">
                  Updated {new Date(item.updatedAt).toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="cly-callout">
            No saved configuration yet. Start from a task preset, review the
            estimate, and save it to this project.
          </div>
        )}
      </Section>
      {presets.length ? (
        <Section
          title="Task presets"
          subtitle="Start from a recommended plan"
          actions={
            <Button
              variant="ghost"
              onClick={() => setShowAllPresets((value) => !value)}
            >
              {showAllPresets ? "Show fewer" : `Show all ${presets.length}`}
            </Button>
          }
        >
          <div className="cly-preset-list">
            {(showAllPresets ? presets : presets.slice(0, 6)).map((preset) => (
              <button
                type="button"
                className="cly-preset-row"
                key={preset.id}
                onClick={() => choosePreset(preset)}
                data-selected={selectedPresetId === preset.id}
                style={{ textAlign: "left", color: "inherit" }}
              >
                <div className="cly-row-between">
                  <strong>{preset.name}</strong>
                  <Badge tone={toneForStatus(preset.usage)}>
                    {preset.usage}
                  </Badge>
                </div>
                <p
                  className="cly-muted cly-small cly-clamp-2"
                  style={{ minHeight: 32 }}
                >
                  {preset.description}
                </p>
                <div className="cly-faint cly-small">
                  {preset.nodes.length} roles ·{" "}
                  {
                    preset.nodes.filter((node) => node.mode === "Reviewer")
                      .length
                  }{" "}
                  reviewer
                </div>
              </button>
            ))}
          </div>
        </Section>
      ) : null}
      <Section
        title="Agent topology"
        subtitle="Role order, models, and scheduler admission limits"
        actions={
          <Button
            onClick={() =>
              updateConfiguration((current) => ({
                ...current,
                maxParallel: current.maxParallel + 1,
                roles: [
                  ...current.roles,
                  {
                    ...configurationFromPreset(undefined).roles[0],
                    id: `implementation-${Date.now()}`,
                  },
                ],
              }))
            }
          >
            <Plus size={13} /> Add role
          </Button>
        }
      >
        <div className="cly-topology">
          {configuration.roles.map((role, index) => (
            <div className="cly-agent-node" key={role.id}>
              <div className="cly-row-between">
                <Badge tone={role.role === "review" ? "warning" : "info"}>
                  {role.instanceCount} × {role.role}
                </Badge>
                <div className="cly-row">
                  <Button
                    variant="ghost"
                    iconOnly
                    onClick={() => moveRole(index, -1)}
                    aria-label={`Move ${role.id} earlier`}
                  >
                    <ArrowUp size={11} />
                  </Button>
                  <Button
                    variant="ghost"
                    iconOnly
                    onClick={() => moveRole(index, 1)}
                    aria-label={`Move ${role.id} later`}
                  >
                    <ArrowDown size={11} />
                  </Button>
                </div>
              </div>
              <input
                className="cly-input cly-agent-role"
                value={role.id}
                onChange={(event) =>
                  updateRoleConfiguration(role.id, (current) => ({
                    ...current,
                    id: event.target.value,
                  }))
                }
                aria-label={`Role id ${index + 1}`}
                style={{ marginTop: 8 }}
              />
              <input
                className="cly-input cly-agent-model"
                value={role.model}
                onChange={(event) =>
                  updateRoleConfiguration(role.id, (current) => ({
                    ...current,
                    model: event.target.value,
                  }))
                }
                aria-label={`Model for ${role.id}`}
              />
              <div className="cly-row-between" style={{ marginTop: 8 }}>
                <Button
                  variant="ghost"
                  iconOnly
                  aria-label={`Duplicate ${role.id}`}
                  onClick={() =>
                    updateConfiguration((current) => ({
                      ...current,
                      maxParallel: current.maxParallel + role.maxParallel,
                      roles: [
                        ...current.roles.slice(0, index + 1),
                        { ...role, id: `${role.role}-${Date.now()}` },
                        ...current.roles.slice(index + 1),
                      ],
                    }))
                  }
                >
                  <Copy size={11} />
                </Button>
                <Button
                  variant="ghost"
                  iconOnly
                  aria-label={`Remove ${role.id}`}
                  disabled={configuration.roles.length === 1}
                  onClick={() =>
                    updateConfiguration((current) => ({
                      ...current,
                      maxParallel: Math.max(
                        1,
                        current.maxParallel - role.maxParallel,
                      ),
                      roles: current.roles.filter(
                        (item) => item.id !== role.id,
                      ),
                    }))
                  }
                >
                  <Trash2 size={11} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section
        title="Plan controls"
        actions={
          <div className="cly-row cly-small">
            <span>Advanced</span>
            <Toggle
              pressed={advanced}
              onChange={setAdvanced}
              label="Toggle advanced agent controls"
            />
          </div>
        }
      >
        <Panel className="cly-panel-body">
          <div className="cly-grid-3">
            <div className="cly-field">
              <label htmlFor="agent-configuration-name">
                Configuration name
              </label>
              <input
                id="agent-configuration-name"
                className="cly-input"
                value={configuration.name}
                onChange={(event) =>
                  updateConfiguration((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </div>
            <div className="cly-field">
              <label htmlFor="agent-global-parallel">Global parallel cap</label>
              <input
                id="agent-global-parallel"
                type="number"
                min={1}
                className="cly-input"
                value={configuration.maxParallel}
                onChange={(event) =>
                  updateConfiguration((current) => ({
                    ...current,
                    maxParallel: Number(event.target.value),
                  }))
                }
              />
            </div>
            <div className="cly-field">
              <label htmlFor="agent-failure-policy">
                Partial failure policy
              </label>
              <select
                id="agent-failure-policy"
                className="cly-select"
                value={configuration.partialFailurePolicy}
                onChange={(event) =>
                  updateConfiguration((current) => ({
                    ...current,
                    partialFailurePolicy: event.target.value as
                      | "continue"
                      | "cancel_remaining",
                  }))
                }
              >
                <option value="continue">Continue independent roles</option>
                <option value="cancel_remaining">Cancel remaining roles</option>
              </select>
            </div>
          </div>
          <div className="cly-grid-3" style={{ marginTop: 12 }}>
            {(
              [
                ["maxInputTokens", "Input token cap"],
                ["maxOutputTokens", "Output token cap"],
                ["maxCostMinorUnits", "Cost cap (minor units)"],
                ["maxRuntimeMs", "Runtime cap (ms)"],
              ] as const
            ).map(([key, label]) => (
              <div className="cly-field" key={key}>
                <label htmlFor={`agent-global-${key}`}>{label}</label>
                <input
                  id={`agent-global-${key}`}
                  type="number"
                  min={key === "maxRuntimeMs" ? 1 : 0}
                  className="cly-input"
                  value={configuration.maxTotalBudget[key]}
                  onChange={(event) =>
                    updateConfiguration((current) => ({
                      ...current,
                      maxTotalBudget: {
                        ...current.maxTotalBudget,
                        [key]: Number(event.target.value),
                      },
                    }))
                  }
                />
              </div>
            ))}
          </div>
          {advanced ? (
            <div style={{ marginTop: 14 }}>
              {configuration.roles.map((role) => (
                <DisclosureRow
                  key={role.id}
                  title={`${role.id} · ${role.role}`}
                  detail={`${role.instanceCount} instances · ${role.maxParallel} parallel · ${role.provider}/${role.model}`}
                >
                  <div className="cly-grid-3">
                    <div className="cly-field">
                      <label htmlFor={`${role.id}-instances`}>
                        Instance count
                      </label>
                      <input
                        id={`${role.id}-instances`}
                        type="number"
                        min={1}
                        className="cly-input"
                        value={role.instanceCount}
                        onChange={(event) =>
                          updateRoleConfiguration(role.id, (current) => ({
                            ...current,
                            instanceCount: Number(event.target.value),
                          }))
                        }
                      />
                    </div>
                    <div className="cly-field">
                      <label htmlFor={`${role.id}-parallel`}>
                        Role parallel cap
                      </label>
                      <input
                        id={`${role.id}-parallel`}
                        type="number"
                        min={1}
                        className="cly-input"
                        value={role.maxParallel}
                        onChange={(event) =>
                          updateRoleConfiguration(role.id, (current) => ({
                            ...current,
                            maxParallel: Number(event.target.value),
                          }))
                        }
                      />
                    </div>
                    <div className="cly-field">
                      <label htmlFor={`${role.id}-reasoning`}>Reasoning</label>
                      <select
                        id={`${role.id}-reasoning`}
                        className="cly-select"
                        value={role.reasoningLevel}
                        onChange={(event) =>
                          updateRoleConfiguration(role.id, (current) => ({
                            ...current,
                            reasoningLevel: event.target
                              .value as AgentRoleConfiguration["reasoningLevel"],
                          }))
                        }
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                    <div className="cly-field">
                      <label htmlFor={`${role.id}-provider`}>Provider</label>
                      <input
                        id={`${role.id}-provider`}
                        className="cly-input"
                        value={role.provider}
                        onChange={(event) =>
                          updateRoleConfiguration(role.id, (current) => ({
                            ...current,
                            provider: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="cly-field">
                      <label htmlFor={`${role.id}-model`}>Model</label>
                      <input
                        id={`${role.id}-model`}
                        className="cly-input"
                        value={role.model}
                        onChange={(event) =>
                          updateRoleConfiguration(role.id, (current) => ({
                            ...current,
                            model: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="cly-field">
                      <label htmlFor={`${role.id}-fallback`}>
                        Fallback model
                      </label>
                      <input
                        id={`${role.id}-fallback`}
                        className="cly-input"
                        value={role.fallbackModel ?? ""}
                        onChange={(event) =>
                          updateRoleConfiguration(role.id, (current) => ({
                            ...current,
                            fallbackModel: event.target.value || undefined,
                          }))
                        }
                      />
                    </div>
                    {(
                      [
                        ["maxInputTokens", "Input tokens"],
                        ["maxOutputTokens", "Output tokens"],
                        ["maxCostMinorUnits", "Cost minor units"],
                        ["maxRuntimeMs", "Runtime ms"],
                      ] as const
                    ).map(([key, label]) => (
                      <div className="cly-field" key={key}>
                        <label htmlFor={`${role.id}-${key}`}>{label}</label>
                        <input
                          id={`${role.id}-${key}`}
                          type="number"
                          min={key === "maxRuntimeMs" ? 1 : 0}
                          className="cly-input"
                          value={role.budget[key]}
                          onChange={(event) =>
                            updateRoleConfiguration(role.id, (current) => ({
                              ...current,
                              budget: {
                                ...current.budget,
                                [key]: Number(event.target.value),
                              },
                            }))
                          }
                        />
                      </div>
                    ))}
                    {(
                      [
                        ["allowedTools", "Allowed tools"],
                        ["allowedContextSources", "Context sources"],
                        ["allowedFileGlobs", "File globs"],
                        ["approvalCheckpoints", "Approval checkpoints"],
                      ] as const
                    ).map(([key, label]) => (
                      <div className="cly-field" key={key}>
                        <label htmlFor={`${role.id}-${key}`}>{label}</label>
                        <input
                          id={`${role.id}-${key}`}
                          className="cly-input"
                          value={role[key].join(", ")}
                          onChange={(event) =>
                            updateRoleConfiguration(role.id, (current) => ({
                              ...current,
                              [key]: commaList(event.target.value),
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <div
                    className="cly-row"
                    style={{ marginTop: 12, flexWrap: "wrap" }}
                  >
                    {(
                      [
                        ["canReadFiles", "Read files"],
                        ["canWriteFiles", "Write files"],
                        ["canRunCommands", "Run commands"],
                        ["canAccessNetwork", "Network"],
                        ["requiresApprovalForWrite", "Approve writes"],
                        ["requiresApprovalForNetwork", "Approve network"],
                      ] as const
                    ).map(([key, label]) => (
                      <label className="cly-row cly-small" key={key}>
                        <input
                          type="checkbox"
                          className="cly-checkbox"
                          checked={role.permissions[key]}
                          onChange={(event) =>
                            updateRoleConfiguration(role.id, (current) => ({
                              ...current,
                              permissions: {
                                ...current.permissions,
                                [key]: event.target.checked,
                              },
                            }))
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </DisclosureRow>
              ))}
            </div>
          ) : null}
          {estimate ? (
            <div style={{ marginTop: 15 }} aria-live="polite">
              <div className="cly-metric-row">
                <Metric
                  label="Input tokens"
                  value={estimate.inputTokens.toLocaleString()}
                />
                <Metric
                  label="Output tokens"
                  value={estimate.outputTokens.toLocaleString()}
                />
                <Metric
                  label="Cost minor units"
                  value={estimate.costMinorUnits.toLocaleString()}
                />
                <Metric
                  label="Runtime"
                  value={`${estimate.runtimeMs.toLocaleString()} ms`}
                />
              </div>
              <div
                className="cly-callout"
                data-tone={estimate.reasons.length ? "warning" : undefined}
                style={{ marginTop: 10 }}
              >
                {estimate.reasons.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {estimate.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : (
                  "All configured tools and context sources are accessible."
                )}
              </div>
            </div>
          ) : null}
          <div className="cly-row-between" style={{ marginTop: 15 }}>
            <div className="cly-row">
              <Shield size={14} />
              <span className="cly-muted cly-small">
                Numeric caps, project scope, permissions, and approval
                checkpoints are enforced by the scheduler.
              </span>
            </div>
            <Button
              variant="primary"
              disabled
              title={capabilityUnavailableMessage("agents.execute")}
              onClick={() =>
                void projectServices.agents.startPreview(selectedPresetId)
              }
            >
              <Play size={13} /> Preview execution
            </Button>
          </div>
        </Panel>
      </Section>
    </div>
  );
}

export function SettingsScreen() {
  const { theme, setTheme } = useTheme();
  const fixtureMode = useClyStore((s) => s.fixtureMode);
  const setFixtureMode = useClyStore((s) => s.setFixtureMode);
  const notify = useClyStore((s) => s.notify);
  const [section, setSection] = useState("Appearance");
  return (
    <div className="cly-page cly-route-settings">
      <PageHeader
        kicker="System"
        title="Settings"
        description="Appearance, behavior, privacy, and defaults."
      />
      <div className="cly-settings-layout">
        <nav className="cly-settings-nav" aria-label="Settings sections">
          {[
            "Appearance",
            "Behavior",
            "Privacy",
            "Research defaults",
            "Keyboard shortcuts",
            ...(__CLY_INCLUDE_DEMOS__ && isClyDemoRuntime
              ? ["Fixture mode"]
              : []),
            "Diagnostics",
          ].map((item) => (
            <button
              key={item}
              type="button"
              aria-current={section === item ? "page" : undefined}
              onClick={() => setSection(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <div>
          {section === "Appearance" ? (
            <Panel className="cly-panel-body">
              <div className="cly-field">
                <span className="cly-muted cly-small">Color theme</span>
                <Segmented
                  value={(theme ?? "light") as "dark" | "light" | "system"}
                  options={["dark", "light", "system"] as const}
                  onChange={setTheme}
                  label="Color theme"
                />
              </div>
              <div className="cly-divider" style={{ margin: "16px 0" }} />
              <div className="cly-row-between">
                <span>
                  <strong>Dense tables</strong>
                  <span
                    className="cly-muted cly-small"
                    style={{ display: "block" }}
                  >
                    Use compact desktop-native row height
                  </span>
                </span>
                <Toggle
                  pressed
                  onChange={() => {}}
                  label="Dense tables"
                  disabled
                  reason="Table density preferences are not yet persisted."
                />
              </div>
            </Panel>
          ) : null}
          {section === "Behavior" ? (
            <SettingsRows
              rows={[
                "Open inspector on selection",
                "Restore last workspace",
                "Confirm destructive actions",
                "Show activity completion notifications",
              ]}
            />
          ) : null}
          {section === "Privacy" ? (
            <Panel className="cly-panel-body cly-stack">
              <div className="cly-callout">
                <strong>Local-first by default</strong>
                <p className="cly-muted cly-small">
                  Research records use the project-scoped local SQLite service.
                  External and sensitive effects require an implemented approval
                  flow before their controls become available.
                </p>
              </div>
              {[
                "Never include secrets in context",
                "Require approval before file modification",
                "Restrict cloud models from source text",
                "Record provenance for every future mutation",
              ].map((item) => (
                <div className="cly-row-between" key={item}>
                  <span>{item}</span>
                  <Toggle
                    pressed
                    onChange={() => {}}
                    label={item}
                    disabled
                    reason="This privacy preference is not yet persisted or enforced."
                  />
                </div>
              ))}
            </Panel>
          ) : null}
          {section === "Research defaults" ? (
            <Panel className="cly-panel-body">
              <div className="cly-grid-2">
                {[
                  ["Default project phase", "Exploration"],
                  ["New claim status", "Unsupported"],
                  ["Experiment reproducibility", "Partial until audited"],
                  ["Context warning threshold", "75%"],
                ].map(([label, value]) => (
                  <div className="cly-field" key={label}>
                    <span className="cly-muted cly-small">{label}</span>
                    <button
                      type="button"
                      className="cly-input"
                      disabled
                      title="Research defaults are not yet persisted."
                      style={{ textAlign: "left" }}
                      onClick={() =>
                        notify("Research default", `${label}: ${value}`)
                      }
                    >
                      {value}
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}
          {section === "Keyboard shortcuts" ? (
            <Panel>
              {[
                ["Command palette", "⌘K"],
                ["Open project", "⌘O"],
                ["Project switcher", "⌘⇧O"],
                ["Create contextual object", "⌘N"],
                ["Overview", "⌘1"],
                ["Agent sessions", "⌘2"],
                ["Context", "⌘3"],
                ["Research graph", "⌘4"],
                ["Experiments", "⌘5"],
                ["Claims", "⌘6"],
                ["Settings", "⌘,"],
                ["Toggle inspector", "⌘⌥I"],
                ["Activity drawer", "⌘J"],
                ["Focus current search", "⌘F"],
                ["Close modal / clear selection", "Esc"],
              ].map(([label, shortcut]) => (
                <div className="cly-list-row" key={label}>
                  <span>{label}</span>
                  <kbd className="cly-kbd">{shortcut}</kbd>
                </div>
              ))}
            </Panel>
          ) : null}
          {__CLY_INCLUDE_DEMOS__ &&
          isClyDemoRuntime &&
          section === "Fixture mode" ? (
            <Panel className="cly-panel-body">
              <div className="cly-callout" data-tone="warning">
                Development-only state selector. Production builds will not
                expose fixture controls.
              </div>
              <div className="cly-grid-2" style={{ marginTop: 12 }}>
                {(
                  [
                    "empty",
                    "new",
                    "active",
                    "large",
                    "loading",
                    "risks",
                    "offline",
                    "errors",
                  ] as const
                ).map((mode) => (
                  <button
                    className="cly-panel cly-panel-body"
                    type="button"
                    key={mode}
                    onClick={() => setFixtureMode(mode)}
                    style={{
                      textAlign: "left",
                      color: "inherit",
                      cursor: "pointer",
                      borderColor:
                        fixtureMode === mode ? "var(--cly-accent)" : undefined,
                    }}
                  >
                    <div className="cly-row-between">
                      <strong>
                        {mode
                          .replace("risks", "integrity risks")
                          .replace("errors", "integration errors")}
                      </strong>
                      {fixtureMode === mode ? <Check size={13} /> : null}
                    </div>
                  </button>
                ))}
              </div>
            </Panel>
          ) : null}
          {section === "Diagnostics" ? (
            <Panel className="cly-panel-body">
              <div className="cly-detail-grid">
                <dt>Renderer</dt>
                <dd>React 19 · Vite 8</dd>
                <dt>Desktop</dt>
                <dd>Electron 41</dd>
                <dt>Storage</dt>
                <dd>Project-scoped SQLite research repository</dd>
                <dt>Network</dt>
                <dd>Local authenticated research API</dd>
                {isClyDemoRuntime ? (
                  <>
                    <dt>Fixture</dt>
                    <dd>{fixtureMode}</dd>
                  </>
                ) : null}
                <dt>Build</dt>
                <dd>0.5.0</dd>
              </div>
              <Button
                style={{ marginTop: 14 }}
                onClick={() =>
                  notify(
                    "Diagnostics copied",
                    "Renderer, Electron, storage, and service-boundary details copied.",
                  )
                }
              >
                Copy diagnostics
              </Button>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SettingsRows({ rows }: { rows: string[] }) {
  return (
    <Panel className="cly-panel-body cly-stack">
      {rows.map((row) => (
        <div className="cly-row-between" key={row}>
          <span>{row}</span>
          <Toggle
            pressed
            onChange={() => {}}
            label={row}
            disabled
            reason="This behavior preference is not yet persisted."
          />
        </div>
      ))}
    </Panel>
  );
}
