import type { Page } from "@playwright/test";

export const installProviderModelsFixture = async (page: Page) => {
  await page.route("**/api/provider-models", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        fetchedAt: new Date().toISOString(),
        openai: {
          installed: true,
          models: [
            {
              id: "gpt-5.6-sol",
              label: "GPT-5.6 Sol",
              reasoningEfforts: ["low", "medium", "high", "xhigh"],
            },
            {
              id: "gpt-5.6-terra",
              label: "GPT-5.6 Terra",
              reasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
            },
          ],
          source: "cli",
          version: "test",
        },
        anthropic: {
          installed: true,
          models: [
            {
              id: "sonnet",
              label: "Claude Sonnet",
              reasoningEfforts: ["low", "medium", "high", "xhigh"],
            },
          ],
          source: "cli",
          version: "test",
        },
        opencode: {
          installed: true,
          models: [
            {
              id: "openai/gpt-5.5",
              label: "OpenAI / GPT-5.5",
              reasoningEfforts: ["low", "medium", "high", "xhigh"],
            },
          ],
          source: "cli",
          version: "test",
        },
        cursor: {
          error: "CLI not installed in this browser test.",
          installed: false,
          models: [],
          source: "unavailable",
          version: null,
        },
      }),
      contentType: "application/json",
    });
  });
};
