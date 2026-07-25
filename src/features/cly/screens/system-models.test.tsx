import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useIdeStore } from "../../../components/ide/ide-store";
import { createFixtureRepository } from "../fixtures/repository";
import { useClyStore } from "../store/cly-store";
import { ModelsAgentsScreen } from "./system";

describe("Models & Agents", () => {
  beforeEach(() => {
    localStorage.clear();
    useClyStore.setState({
      activeProjectId: "project-cly",
      data: createFixtureRepository("active"),
      toasts: [],
    });
    useIdeStore.setState({
      providerModels: {
        fetchedAt: new Date().toISOString(),
        openai: {
          installed: true,
          loading: false,
          error: null,
          source: "cli",
          version: "1.0.0",
          models: [
            {
              id: "gpt-5.6-sol",
              label: "GPT-5.6 Sol",
              reasoningEfforts: ["low", "medium", "high", "xhigh"],
            },
            {
              id: "gpt-5.6-terra",
              label: "GPT-5.6 Terra",
              reasoningEfforts: ["low", "medium", "high", "xhigh"],
            },
            {
              id: "gpt-5.4-mini",
              label: "GPT-5.4 Mini",
              reasoningEfforts: ["low", "medium", "high"],
            },
          ],
        },
        anthropic: {
          installed: true,
          loading: false,
          error: null,
          source: "cli",
          version: "1.0.0",
          models: [
            {
              id: "opus",
              label: "Claude Opus",
              reasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
            },
          ],
        },
        opencode: {
          installed: true,
          loading: false,
          error: null,
          source: "cli",
          version: "1.0.0",
          models: [{ id: "openai/gpt-5.5", label: "OpenAI / gpt-5.5" }],
        },
        cursor: {
          installed: false,
          loading: false,
          error: null,
          source: "unavailable",
          version: null,
          models: [],
        },
      },
    });
  });

  it("selects from detected models and exposes only supported reasoning", async () => {
    const user = userEvent.setup();
    render(<ModelsAgentsScreen />);

    expect(screen.getAllByText("GPT-5.6 Sol · Codex")[0]).toBeVisible();
    expect(screen.getAllByText("OpenAI / gpt-5.5 · OpenCode")[0]).toBeVisible();
    expect(screen.queryByRole("option", { name: "GPT-5" })).toBeNull();

    const roleModel = screen.getAllByLabelText(/^Model for /)[0];
    expect(roleModel).toBeDefined();
    if (!roleModel) return;
    await user.selectOptions(roleModel, "anthropic:opus");
    expect(roleModel).toHaveValue("anthropic:opus");

    await user.click(
      screen.getByRole("switch", {
        name: "Toggle advanced agent controls",
      }),
    );
    const firstDisclosure = document.querySelector(
      ".cly-disclosure-row summary",
    );
    expect(firstDisclosure).not.toBeNull();
    if (!firstDisclosure) return;
    await user.click(firstDisclosure);

    const reasoning = screen.getAllByLabelText("Reasoning")[0];
    expect(reasoning).toBeDefined();
    if (!reasoning) return;
    expect(
      within(reasoning).getByRole("option", { name: "Max" }),
    ).toBeVisible();
    await user.selectOptions(reasoning, "max");
    expect(reasoning).toHaveValue("max");

    await user.selectOptions(roleModel, "openai:gpt-5.4-mini");
    expect(
      within(reasoning).queryByRole("option", { name: "Extra High" }),
    ).toBeNull();
  });

  it("opens the real Agent Sessions workspace instead of a disabled execution preview", async () => {
    const user = userEvent.setup();
    render(<ModelsAgentsScreen />);

    expect(
      screen.queryByRole("button", { name: "Preview execution" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Open Agent Sessions" }),
    );

    expect(useClyStore.getState().activeScreen).toBe("agents");
  });
});
