import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createOnboardingDiagnosticsService,
  diagnoseOnboardingProject,
} from "./onboarding-diagnostics.js";

describe("onboarding diagnostics", () => {
  it("checks a local folder without requiring an external integration", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cly-onboarding-"));
    writeFileSync(path.join(root, "README.md"), "local project");
    const result = await diagnoseOnboardingProject({
      id: "project-a",
      path: root,
      metadata: {},
    });
    expect(result.state).toBe("ready");
    expect(
      result.checks.find((item) => item.id === "filesystem"),
    ).toMatchObject({
      status: "pass",
    });
    expect(
      result.checks.find((item) => item.id === "integrations"),
    ).toMatchObject({
      status: "pass",
    });
  });

  it("caps traversal and reports a large repository", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cly-onboarding-large-"));
    for (let group = 0; group < 101; group += 1) {
      const directory = path.join(root, `group-${group}`);
      mkdirSync(directory);
      for (let file = 0; file < 100; file += 1)
        writeFileSync(path.join(directory, `${file}.txt`), "x");
    }
    const result = await diagnoseOnboardingProject({
      id: "project-large",
      path: root,
      metadata: {},
    });
    expect(result.repositorySize).toBe("large");
    expect(result.scannedFiles).toBe(10_001);
  });

  it("loads the durable project through the repository boundary", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "cly-onboarding-service-"),
    );
    const repository = {
      getProject: (projectId) => ({ id: projectId, path: root, metadata: {} }),
    };
    const service = createOnboardingDiagnosticsService(repository);
    await expect(service.diagnose("project-a")).resolves.toMatchObject({
      state: "ready",
    });
  });
});
