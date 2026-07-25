import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Download,
  LifeBuoy,
  Play,
  Plus,
  RotateCcw,
  Save,
  Shield,
  Trash2,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { getDesktopApi } from "../../../lib/electron";
import type { AgentModelChoice } from "../agent-sessions/model-catalog";
import {
  getAgentReasoningOptions,
  parseAgentModelKey,
  resolveAgentModelSelection,
  resolveAgentReasoningEffort,
  useAgentModelCatalog,
} from "../agent-sessions/model-catalog";
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
  Metric,
  PageHeader,
  Panel,
  Section,
  Segmented,
  Toggle,
  toneForStatus,
} from "../components/primitives";
import type { AgentPreset } from "../domain/types";
import { projectServices } from "../services/project-services";
import { isClyDemoRuntime } from "../services/runtime";
import { useClyStore } from "../store/cly-store";

const resourceBudget = {
  maxInputTokens: 32_000,
  maxOutputTokens: 8_000,
  maxCostMinorUnits: 500,
  maxRuntimeMs: 2_700_000,
};

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
  modelChoices: AgentModelChoice[],
): AgentConfigurationInput => {
  const roles = (preset?.nodes ?? []).map((node, index) => {
    const preferredProvider = node.model.toLowerCase().includes("claude")
      ? "anthropic"
      : "openai";
    const choice = resolveAgentModelSelection(modelChoices, {
      provider: preferredProvider,
      model: node.model,
    });
    return {
      id: `${inferRole(node.role)}-${index + 1}`,
      role: inferRole(node.role),
      instanceCount: 1,
      maxParallel: 1,
      provider: choice?.provider ?? "",
      model: choice?.model ?? "",
      reasoningLevel:
        resolveAgentReasoningEffort(node.reasoning, choice) ?? "medium",
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
    };
  });
  const defaultChoice = modelChoices[0] ?? null;
  const safeRoles = roles.length
    ? roles
    : [
        {
          id: "implementation-1",
          role: "implementation" as const,
          instanceCount: 1,
          maxParallel: 1,
          provider: defaultChoice?.provider ?? "",
          model: defaultChoice?.model ?? "",
          reasoningLevel:
            resolveAgentReasoningEffort("medium", defaultChoice) ?? "medium",
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

export { IntegrationsScreen } from "./integrations";

export function ModelsAgentsScreen() {
  const presets = useClyStore((s) => s.data.agentPresets);
  const storedConfigurations = useClyStore((s) => s.data.agentConfigurations);
  const configurations = storedConfigurations ?? emptyAgentConfigurations;
  const activeProjectId = useClyStore((s) => s.activeProjectId);
  const notify = useClyStore((s) => s.notify);
  const setScreen = useClyStore((s) => s.setScreen);
  const modelCatalog = useAgentModelCatalog();
  const modelChoices = modelCatalog.choices;
  const visibleModelChoices = modelChoices.slice(0, 12);
  const [selectedPresetId, setSelectedPresetId] = useState(
    presets[1]?.id ?? presets[0]?.id,
  );
  const original =
    presets.find((item) => item.id === selectedPresetId) ?? presets[0];
  const [advanced, setAdvanced] = useState(false);
  const [showAllPresets, setShowAllPresets] = useState(false);
  const [configuration, setConfiguration] = useState<
    AgentConfiguration | AgentConfigurationInput
  >(() => configurations[0] ?? configurationFromPreset(original, modelChoices));
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
      setConfiguration(configurationFromPreset(original, modelChoices));
      setEstimate(null);
      setEstimateReviewed(false);
      setAdoptHydratedConfiguration(true);
      return;
    }
    if (adoptHydratedConfiguration && configurations[0]) {
      setConfiguration(configurations[0]);
      setAdoptHydratedConfiguration(false);
    }
  }, [
    activeProjectId,
    adoptHydratedConfiguration,
    configurations,
    modelChoices,
    original,
  ]);

  useEffect(() => {
    if (modelChoices.length === 0) return;
    setConfiguration((current) => {
      let changed = false;
      const roles = current.roles.map((role) => {
        const choice = resolveAgentModelSelection(modelChoices, role);
        if (!choice) return role;
        const reasoningLevel =
          resolveAgentReasoningEffort(role.reasoningLevel, choice) ?? "medium";
        if (
          role.provider === choice.provider &&
          role.model === choice.model &&
          role.reasoningLevel === reasoningLevel
        ) {
          return role;
        }
        changed = true;
        return {
          ...role,
          provider: choice.provider,
          model: choice.model,
          reasoningLevel,
        };
      });
      return changed ? { ...current, roles } : current;
    });
  }, [modelChoices]);

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

  const modelChoiceForRole = (role: AgentRoleConfiguration) =>
    resolveAgentModelSelection(modelChoices, role);

  const selectRoleModel = (role: AgentRoleConfiguration, key: string) => {
    const choice = parseAgentModelKey(modelChoices, key);
    if (!choice) return;
    updateRoleConfiguration(role.id, (current) => ({
      ...current,
      provider: choice.provider,
      model: choice.model,
      reasoningLevel:
        resolveAgentReasoningEffort(current.reasoningLevel, choice) ?? "medium",
    }));
  };

  const choosePreset = (preset: AgentPreset) => {
    setSelectedPresetId(preset.id);
    setAdoptHydratedConfiguration(false);
    setConfiguration(configurationFromPreset(preset, modelChoices));
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
    if (modelChoices.length === 0) {
      notify(
        "No model is ready",
        "Install and sign in to a supported local AI provider, then refresh detected models.",
      );
      return;
    }
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
      setConfiguration(configurationFromPreset(original, modelChoices));
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
                setConfiguration(
                  configurationFromPreset(original, modelChoices),
                );
                setAdoptHydratedConfiguration(false);
                setEstimate(null);
                setEstimateReviewed(false);
                notify("Plan reset to recommended");
              }}
            >
              <RotateCcw size={13} /> Reset
            </Button>
            <Button
              variant="primary"
              disabled={modelChoices.length === 0}
              onClick={() => void save()}
            >
              <Save size={13} />
              {estimateReviewed ? "Save configuration" : "Review estimate"}
            </Button>
          </>
        }
      />
      <Section
        title="Detected models"
        subtitle="Read live from your signed-in local Codex, Claude Code, OpenCode, and Cursor installations"
        actions={
          <Button
            onClick={() => void modelCatalog.refresh()}
            disabled={modelCatalog.loading}
          >
            <RotateCcw size={13} />
            {modelCatalog.loading ? "Detecting…" : "Refresh"}
          </Button>
        }
      >
        {modelChoices.length ? (
          <div className="cly-row" style={{ flexWrap: "wrap" }}>
            {visibleModelChoices.map((choice) => (
              <Badge key={choice.key} tone="success">
                {choice.displayLabel}
              </Badge>
            ))}
            {modelChoices.length > visibleModelChoices.length ? (
              <Badge tone="neutral">
                +{modelChoices.length - visibleModelChoices.length} more in the
                selectors
              </Badge>
            ) : null}
          </div>
        ) : (
          <div className="cly-callout" data-tone="warning">
            {modelCatalog.loading
              ? "Checking installed AI providers and their available models…"
              : "No usable local models were detected. Install and sign in to Codex, Claude Code, OpenCode, or Cursor, then refresh."}
          </div>
        )}
        {modelCatalog.errors.length > 0 ? (
          <p className="cly-muted cly-small" style={{ marginTop: 10 }}>
            Some providers are unavailable: {modelCatalog.errors.join(" · ")}
          </p>
        ) : null}
      </Section>
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
                    ...configurationFromPreset(undefined, modelChoices)
                      .roles[0],
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
          {configuration.roles.map((role, index) => {
            const modelChoice = modelChoiceForRole(role);
            return (
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
                <select
                  className="cly-select cly-agent-model"
                  value={modelChoice?.key ?? ""}
                  onChange={(event) =>
                    selectRoleModel(role, event.target.value)
                  }
                  aria-label={`Model for ${role.id}`}
                  disabled={modelChoices.length === 0}
                >
                  {modelChoices.length === 0 ? (
                    <option value="">
                      {modelCatalog.loading
                        ? "Detecting models…"
                        : "No detected models"}
                    </option>
                  ) : null}
                  {modelChoices.map((choice) => (
                    <option key={choice.key} value={choice.key}>
                      {choice.displayLabel}
                    </option>
                  ))}
                </select>
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
            );
          })}
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
              {configuration.roles.map((role) => {
                const modelChoice = modelChoiceForRole(role);
                const reasoningOptions = getAgentReasoningOptions(modelChoice);
                return (
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
                        <label htmlFor={`${role.id}-reasoning`}>
                          Reasoning
                        </label>
                        <select
                          id={`${role.id}-reasoning`}
                          className="cly-select"
                          value={role.reasoningLevel}
                          disabled={reasoningOptions.length === 0}
                          onChange={(event) =>
                            updateRoleConfiguration(role.id, (current) => ({
                              ...current,
                              reasoningLevel: event.target
                                .value as AgentRoleConfiguration["reasoningLevel"],
                            }))
                          }
                        >
                          {reasoningOptions.length === 0 ? (
                            <option value={role.reasoningLevel}>
                              Not supported by this model
                            </option>
                          ) : null}
                          {reasoningOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="cly-field">
                        <label htmlFor={`${role.id}-provider`}>Provider</label>
                        <input
                          id={`${role.id}-provider`}
                          className="cly-input"
                          value={modelChoice?.providerLabel ?? role.provider}
                          readOnly
                        />
                      </div>
                      <div className="cly-field">
                        <label htmlFor={`${role.id}-model`}>Model</label>
                        <select
                          id={`${role.id}-model`}
                          className="cly-select"
                          value={modelChoice?.key ?? ""}
                          onChange={(event) =>
                            selectRoleModel(role, event.target.value)
                          }
                          disabled={modelChoices.length === 0}
                        >
                          {modelChoices.length === 0 ? (
                            <option value="">
                              {modelCatalog.loading
                                ? "Detecting models…"
                                : "No detected models"}
                            </option>
                          ) : null}
                          {modelChoices.map((choice) => (
                            <option key={choice.key} value={choice.key}>
                              {choice.displayLabel}
                            </option>
                          ))}
                        </select>
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
                );
              })}
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
              disabled={!activeProjectId}
              title={
                activeProjectId
                  ? "Run a configured model in Agent Sessions."
                  : "Choose a research project before starting an agent session."
              }
              onClick={() => setScreen("agents")}
            >
              <Play size={13} /> Open Agent Sessions
            </Button>
          </div>
        </Panel>
      </Section>
    </div>
  );
}

export function SettingsScreen() {
  const { theme, setTheme } = useTheme();
  const data = useClyStore((s) => s.data);
  const activeProjectId = useClyStore((s) => s.activeProjectId);
  const fixtureMode = useClyStore((s) => s.fixtureMode);
  const setFixtureMode = useClyStore((s) => s.setFixtureMode);
  const notify = useClyStore((s) => s.notify);
  const [section, setSection] = useState("Appearance");
  const project =
    data.projects.find((item) => item.id === activeProjectId) ??
    data.projects[0];
  const diagnostics = [
    "Cly 0.5.0 (Open Beta)",
    "Renderer: React 19 / Vite 8",
    "Desktop: Electron 41",
    "Storage: project-scoped local SQLite research repository",
    "Network: local authenticated research API",
    `Runtime: ${isClyDemoRuntime ? `demo fixture (${fixtureMode})` : "production"}`,
    `Project: ${project?.id ?? "none"}`,
  ].join("\n");

  const copyDiagnostics = async () => {
    const desktopApi = getDesktopApi();
    const copied = desktopApi
      ? await desktopApi.writeClipboardText(diagnostics)
      : Boolean(
          typeof navigator !== "undefined" &&
            navigator.clipboard &&
            (await navigator.clipboard
              .writeText(diagnostics)
              .then(() => true)
              .catch(() => false)),
        );
    notify(
      copied ? "Diagnostics copied" : "Diagnostics not copied",
      copied
        ? "Paste these details into a beta issue report."
        : "Clipboard permission was denied. The details remain visible here.",
    );
  };

  const exportProject = async () => {
    if (!project) return;
    const contents = JSON.stringify(
      {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        app: "Cly Open Beta 0.5.0",
        project,
        repository: data,
      },
      null,
      2,
    );
    const safeName =
      project.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "cly-project";
    const fileName = `${safeName}-backup.json`;
    const desktopApi = getDesktopApi();
    if (desktopApi) {
      const saved = await desktopApi.saveTextFile({
        contents,
        defaultPath: fileName,
        title: "Export Cly project backup",
      });
      notify(
        saved ? "Project backup exported" : "Project backup canceled",
        saved
          ? `${fileName} contains the current local research state.`
          : undefined,
      );
      return;
    }
    const url = URL.createObjectURL(
      new Blob([contents], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    notify(
      "Project backup exported",
      `${fileName} contains the current local research state.`,
    );
  };

  const reportProblem = () => {
    const url =
      "https://github.com/Frostand/Cly/issues/new?template=bug_report.md";
    const desktopApi = getDesktopApi();
    if (desktopApi) void desktopApi.openExternal(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  };
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
                <Badge>Fixed for beta</Badge>
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
              <div className="cly-callout" data-tone="warning">
                <strong>Free beta safety boundary</strong>
                <p className="cly-muted cly-small">
                  Keep beta projects local and de-identified. Do not enter
                  health records, secrets, personal identifiers, or other
                  regulated data. Cly has not completed a security or compliance
                  review for those uses.
                </p>
              </div>
              <div className="cly-row-between">
                <span>
                  <strong>Export a recovery copy</strong>
                  <span
                    className="cly-muted cly-small"
                    style={{ display: "block" }}
                  >
                    Save the current project state before beta testing.
                  </span>
                </span>
                <Button onClick={() => void exportProject()}>
                  <Download size={13} /> Export project
                </Button>
              </div>
              <div className="cly-divider" />
              {[
                ["Secrets in context", "Not automatically detected or removed"],
                [
                  "File modifications",
                  "Provider and tool approval rules apply",
                ],
                [
                  "Cloud source transmission",
                  "Requires the workflow’s explicit approval",
                ],
                [
                  "Mutation provenance",
                  "Recorded only by workflows marked available",
                ],
              ].map(([item, policy]) => (
                <div className="cly-row-between" key={item}>
                  <span>
                    <strong>{item}</strong>
                    <span
                      className="cly-muted cly-small"
                      style={{ display: "block" }}
                    >
                      {policy}
                    </span>
                  </span>
                  <Badge>Current boundary</Badge>
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
                    <div className="cly-input">{value}</div>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}
          {section === "Keyboard shortcuts" ? (
            <Panel>
              {[
                ["Command palette", "⌘K"],
                ["Choose or open project", "⌘O"],
                ["Project switcher", "⌘⇧O"],
                ["Open claims", "⌘N"],
                ["Research Loop", "⌘1"],
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
                    "guided",
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
                onClick={() => void copyDiagnostics()}
              >
                <Copy size={13} />
                Copy diagnostics
              </Button>
              <Button style={{ marginTop: 14 }} onClick={reportProblem}>
                <LifeBuoy size={13} /> Report a problem
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
          <Badge>Not configurable</Badge>
        </div>
      ))}
    </Panel>
  );
}
