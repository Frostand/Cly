import { describe, expect, it } from "vitest";
import type { IdeState } from "../../../components/ide/store/ide-store-types";
import {
  getAgentModelChoices,
  getAgentReasoningEfforts,
  resolveAgentModelSelection,
  resolveAgentReasoningEffort,
} from "./model-catalog";

const providerModels = {
  fetchedAt: "2026-07-24T12:00:00.000Z",
  openai: {
    installed: true,
    loading: false,
    error: null,
    source: "cli" as const,
    version: "1.2.3",
    models: [
      {
        id: "gpt-5.6-sol",
        label: "GPT-5.6 Sol",
        reasoningEfforts: ["low", "medium", "high", "xhigh"] as const,
      },
      {
        id: "gpt-5.4-mini",
        label: "GPT-5.4 Mini",
        reasoningEfforts: ["low", "medium", "high"] as const,
      },
    ],
  },
  anthropic: {
    installed: true,
    loading: false,
    error: null,
    source: "cli" as const,
    version: "4.6.0",
    models: [
      {
        id: "opus",
        label: "Claude Opus",
        reasoningEfforts: ["low", "medium", "high", "xhigh", "max"] as const,
      },
    ],
  },
  opencode: {
    installed: true,
    loading: false,
    error: null,
    source: "cli" as const,
    version: "1.0.0",
    models: [
      {
        id: "openai/gpt-5.5",
        label: "OpenAI / gpt-5.5",
      },
    ],
  },
  cursor: {
    installed: false,
    loading: false,
    error: "Cursor Agent CLI is not installed.",
    source: "unavailable" as const,
    version: null,
    models: [],
  },
} satisfies IdeState["providerModels"];

describe("agent model catalog", () => {
  it("lists models detected from every installed provider without static GPT-5 entries", () => {
    const choices = getAgentModelChoices(providerModels);

    expect(choices.map((choice) => choice.model)).toEqual([
      "gpt-5.6-sol",
      "gpt-5.4-mini",
      "opus",
      "openai/gpt-5.5",
    ]);
    expect(choices.map((choice) => choice.displayLabel)).toEqual([
      "GPT-5.6 Sol · Codex",
      "GPT-5.4 Mini · Codex",
      "Claude Opus · Claude Code",
      "OpenAI / gpt-5.5 · OpenCode",
    ]);
    expect(choices.some((choice) => choice.model === "GPT-5")).toBe(false);
  });

  it("keeps provider and model coupled when resolving a selection", () => {
    const choices = getAgentModelChoices(providerModels);

    expect(
      resolveAgentModelSelection(choices, {
        provider: "opencode",
        model: "openai/gpt-5.5",
      }),
    ).toMatchObject({ provider: "opencode", model: "openai/gpt-5.5" });
    expect(
      resolveAgentModelSelection(choices, {
        provider: "openai",
        model: "missing-model",
      }),
    ).toMatchObject({ provider: "openai", model: "gpt-5.6-sol" });
  });

  it("uses detected reasoning levels and supports extra-high and max", () => {
    const choices = getAgentModelChoices(providerModels);
    const codex = choices.find((choice) => choice.model === "gpt-5.6-sol");
    const claude = choices.find((choice) => choice.model === "opus");
    const openCode = choices.find(
      (choice) => choice.model === "openai/gpt-5.5",
    );

    expect(getAgentReasoningEfforts(codex)).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
    expect(getAgentReasoningEfforts(claude)).toContain("max");
    expect(getAgentReasoningEfforts(openCode)).toContain("xhigh");
    expect(resolveAgentReasoningEffort("max", codex)).toBe("medium");
    expect(resolveAgentReasoningEffort("max", claude)).toBe("max");
  });
});
