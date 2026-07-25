// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildClyDevSessionStartAggregate,
  resolveClyDevSessionStartContext,
} from "./session-start.js";

const context = {
  project: { id: "project-a", name: "Project A" },
  workspace: {
    repositoryPath: "/project-a",
    worktreePath: "/project-a",
    branch: "main",
    commitSha: "a".repeat(40),
  },
  machine: { id: "machine-a", platform: "darwin", architecture: "arm64" },
};

describe("production Cly Dev session start", () => {
  it("keeps Codex read-only and gives Claude the effectful task surface", () => {
    const base = {
      title: "Inspect calibration",
      objective: "Inspect and repair calibration.",
      researchObjectIds: [],
    };
    const codex = buildClyDevSessionStartAggregate(
      {
        ...base,
        provider: { id: "openai-codex", model: "gpt-5" },
      },
      context,
    );
    expect(codex.execution).toMatchObject({
      mode: "read_only",
      tools: [{ name: "readFile" }],
    });

    const claude = buildClyDevSessionStartAggregate(
      {
        ...base,
        provider: {
          id: "anthropic-claude",
          model: "claude-sonnet-4-6",
        },
      },
      context,
    );
    expect(claude.execution).toMatchObject({
      mode: "execute",
      tools: [
        { name: "listFiles" },
        { name: "readFile" },
        { name: "writeFile" },
        { name: "runCommand" },
      ],
    });
  });

  it("rejects research-object links that are not owned by the project", async () => {
    const database = {
      prepare(sql: string) {
        return {
          get(...args: string[]) {
            if (sql.includes("FROM projects")) {
              return { id: "project-a", name: "Project A", path: "/project-a" };
            }
            if (sql.includes("FROM research_objects")) {
              return args[0] === "claim-a" && args[1] === "project-a"
                ? { id: "claim-a" }
                : undefined;
            }
            return undefined;
          },
        };
      },
    };

    await expect(
      resolveClyDevSessionStartContext({
        projectId: "project-a",
        researchObjectIds: ["claim-a", "claim-from-another-project"],
        getDatabase: () => database,
        resolveWorkspaceAuthority: async () => ({
          repositoryPath: "/project-a",
          worktreePath: "/project-a",
        }),
      }),
    ).rejects.toThrow(
      "Research object claim-from-another-project was not found in this project.",
    );
  });
});
