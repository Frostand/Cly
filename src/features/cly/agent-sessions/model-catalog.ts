import { useEffect, useMemo } from "react";
import { useIdeStore } from "../../../components/ide/ide-store";
import { REASONING_EFFORT_OPTIONS } from "../../../components/ide/ide-types";
import type { IdeState } from "../../../components/ide/store/ide-store-types";
import {
  formatModelIdLabel,
  getModelReasoningEfforts,
} from "../../../lib/models";
import type { AiProvider, ReasoningEffort } from "../../../types/ide";
import type { AgentReasoningLabel } from "./types";

const PROVIDER_ORDER: AiProvider[] = [
  "openai",
  "anthropic",
  "opencode",
  "cursor",
];

const PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: "Codex",
  anthropic: "Claude Code",
  opencode: "OpenCode",
  cursor: "Cursor",
};

export interface AgentModelChoice {
  key: string;
  provider: AiProvider;
  providerLabel: string;
  model: string;
  modelLabel: string;
  displayLabel: string;
  reasoningEfforts: ReasoningEffort[];
}

export interface AgentModelSelection {
  provider: string;
  model: string;
}

const inferredOpenCodeReasoningEfforts = (model: string): ReasoningEffort[] => {
  const [upstreamProvider, ...modelParts] = model.split("/");
  const upstreamModel = modelParts.join("/");
  if (!upstreamModel) return [];
  if (upstreamProvider === "openai") {
    return getModelReasoningEfforts("openai", upstreamModel);
  }
  if (upstreamProvider === "anthropic") {
    return getModelReasoningEfforts("anthropic", upstreamModel);
  }
  return [];
};

const reasoningEffortsForModel = (
  provider: AiProvider,
  model: string,
  detected: ReasoningEffort[] | undefined,
): ReasoningEffort[] => {
  if (detected?.length) return detected;
  if (provider === "opencode") {
    return inferredOpenCodeReasoningEfforts(model);
  }
  return getModelReasoningEfforts(provider, model);
};

export const getAgentModelChoices = (
  providerModels: IdeState["providerModels"],
): AgentModelChoice[] =>
  PROVIDER_ORDER.flatMap((provider) => {
    const state = providerModels[provider];
    if (!state.installed || state.models.length === 0) return [];
    return state.models.map((model) => ({
      key: `${provider}:${model.id}`,
      provider,
      providerLabel: PROVIDER_LABELS[provider],
      model: model.id,
      modelLabel: model.label,
      displayLabel: `${model.label} · ${PROVIDER_LABELS[provider]}`,
      reasoningEfforts: reasoningEffortsForModel(
        provider,
        model.id,
        model.reasoningEfforts,
      ),
    }));
  });

export const resolveAgentModelSelection = (
  choices: AgentModelChoice[],
  selection: AgentModelSelection,
): AgentModelChoice | null =>
  choices.find(
    (choice) =>
      choice.provider === selection.provider &&
      choice.model === selection.model,
  ) ??
  choices.find((choice) => choice.provider === selection.provider) ??
  choices[0] ??
  null;

export const getAgentReasoningEfforts = (
  choice: AgentModelChoice | null | undefined,
): ReasoningEffort[] => choice?.reasoningEfforts ?? [];

export const resolveAgentReasoningEffort = (
  current: string | null | undefined,
  choice: AgentModelChoice | null | undefined,
): ReasoningEffort | null => {
  const efforts = getAgentReasoningEfforts(choice);
  if (efforts.length === 0) return null;
  const normalized = current
    ?.trim()
    .toLowerCase()
    .replace("extra high", "xhigh");
  if (efforts.includes(normalized as ReasoningEffort)) {
    return normalized as ReasoningEffort;
  }
  return efforts.includes("medium") ? "medium" : (efforts[0] ?? null);
};

export const getAgentReasoningOptions = (
  choice: AgentModelChoice | null | undefined,
) =>
  REASONING_EFFORT_OPTIONS.filter((option) =>
    getAgentReasoningEfforts(choice).includes(option.value),
  );

export const formatAgentReasoningEffort = (
  effort: ReasoningEffort | null,
): AgentReasoningLabel | "Not supported" => {
  const label = REASONING_EFFORT_OPTIONS.find(
    (option) => option.value === effort,
  )?.label;
  return (label as AgentReasoningLabel | undefined) ?? "Not supported";
};

export const toAgentReasoningLabel = (
  effort: ReasoningEffort | null,
): AgentReasoningLabel => {
  const label = formatAgentReasoningEffort(effort);
  return label === "Not supported" ? "Medium" : label;
};

export const parseAgentModelKey = (
  choices: AgentModelChoice[],
  key: string,
): AgentModelChoice | null =>
  choices.find((choice) => choice.key === key) ?? null;

export const formatAgentModelName = (
  provider: string,
  model: string,
): string => {
  const normalizedProvider = provider.trim().toLowerCase();
  if (normalizedProvider === "openai" || normalizedProvider === "codex") {
    return formatModelIdLabel("openai", model);
  }
  if (
    normalizedProvider === "anthropic" ||
    normalizedProvider === "claude" ||
    normalizedProvider === "claude code"
  ) {
    return formatModelIdLabel("anthropic", model);
  }
  if (normalizedProvider === "opencode") {
    const [upstreamProvider, ...modelParts] = model.split("/");
    const upstreamModel = modelParts.join("/");
    if (upstreamModel && ["openai", "anthropic"].includes(upstreamProvider)) {
      return `${formatModelIdLabel(upstreamProvider as AiProvider, upstreamModel)} via OpenCode`;
    }
  }
  return model;
};

export const formatAgentProviderName = (provider: string): string => {
  const normalizedProvider = provider.trim().toLowerCase();
  if (normalizedProvider === "openai" || normalizedProvider === "codex") {
    return "Codex";
  }
  if (normalizedProvider === "anthropic" || normalizedProvider === "claude") {
    return "Claude Code";
  }
  if (normalizedProvider === "opencode") return "OpenCode";
  if (normalizedProvider === "cursor") return "Cursor";
  return provider;
};

export const useAgentModelCatalog = () => {
  const providerModels = useIdeStore((state) => state.providerModels);
  const refreshProviderModels = useIdeStore(
    (state) => state.refreshProviderModels,
  );

  useEffect(() => {
    void refreshProviderModels();
  }, [refreshProviderModels]);

  return useMemo(
    () => ({
      choices: getAgentModelChoices(providerModels),
      fetchedAt: providerModels.fetchedAt,
      loading: PROVIDER_ORDER.some(
        (provider) => providerModels[provider].loading,
      ),
      errors: PROVIDER_ORDER.flatMap((provider) => {
        const state = providerModels[provider];
        return state.error
          ? [`${PROVIDER_LABELS[provider]}: ${state.error}`]
          : [];
      }),
      refresh: () => refreshProviderModels({ force: true }),
    }),
    [providerModels, refreshProviderModels],
  );
};
