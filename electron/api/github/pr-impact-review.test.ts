import { describe, expect, it, vi } from "vitest";
import {
  analyzeResearchImpact,
  collectGitChangeSet,
  createPrImpactReviewService,
  parseGitNameStatus,
} from "./pr-impact-review.js";
import {
  inferredLineage,
  missingProvenanceChangeSet,
  populatedChangeSet,
  researchGraphFixture,
  verifiedLineage,
} from "./pr-impact-review-fixtures.js";

const project = {
  id: "project-alpha",
  name: "Alpha",
  path: "/projects/alpha",
  metadata: {
    researchMotivation: "Make uncertainty estimates reliable under shift.",
    objective: "Improve calibrated uncertainty",
  },
};

describe("research impact analysis", () => {
  it("separates review disciplines and attaches auditable verified evidence", () => {
    const review = analyzeResearchImpact({
      changeSet: populatedChangeSet,
      graph: researchGraphFixture,
      lineage: [verifiedLineage],
      project,
      source: {
        kind: "pull-request",
        number: 60,
        baseRef: "main",
        headRef: "feature",
        state: "open",
      },
    });

    expect(review.researchMotivation.value).toBe(
      "Make uncertainty estimates reliable under shift.",
    );
    expect(review.linkedObjective).toMatchObject({
      value: "Improve calibrated uncertainty",
      linkStatus: "verified",
    });
    expect(review.sections.map((section) => section.category)).toEqual([
      "software",
      "methodology",
      "statistical",
      "data-leakage",
      "reproducibility",
      "claim-impact",
    ]);
    const scienceFindings = review.sections
      .filter((section) => section.category !== "software")
      .flatMap((section) => section.findings);
    expect(scienceFindings.length).toBeGreaterThan(0);
    expect(
      scienceFindings.every((finding) => finding.changedFiles.length > 0),
    ).toBe(true);
    expect(
      scienceFindings.every(
        (finding) => finding.changedCommits[0]?.sha === "2222222",
      ),
    ).toBe(true);
    expect(
      scienceFindings.some((finding) => finding.linkStatus === "verified"),
    ).toBe(true);
    expect(
      scienceFindings.flatMap((finding) => finding.researchObjects),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "method-calibration",
          linkStatus: "verified",
        }),
        expect.objectContaining({
          id: "claim-calibration",
          linkStatus: "verified",
        }),
      ]),
    );
    expect(scienceFindings.flatMap((finding) => finding.relationships)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "relationship-method-dataset",
          linkStatus: "verified",
        }),
        expect.objectContaining({
          id: "evidence-method",
          linkStatus: "verified",
        }),
      ]),
    );
    expect(
      review.validationChecklist.some(
        (item) => item.discipline === "data-leakage",
      ),
    ).toBe(true);
    expect(review.requiresHumanApproval).toBe(true);
  });

  it("labels unreviewed lineage as inferred and never silently approves it", () => {
    const review = analyzeResearchImpact({
      changeSet: populatedChangeSet,
      graph: { objects: [], relationships: [] },
      lineage: [inferredLineage],
      project,
      source: { kind: "local", scope: "working-tree" },
    });

    expect(review.sections.flatMap((section) => section.findings)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          linkStatus: "inferred",
          humanApproval: "required",
        }),
      ]),
    );
    expect(review.approval).toBeNull();
    expect(review.caveats).toContain(
      "Inferred relationships are suggestions until a human reviews them.",
    );
  });

  it("shows missing provenance instead of inventing research links", () => {
    const review = analyzeResearchImpact({
      changeSet: missingProvenanceChangeSet,
      graph: { objects: [], relationships: [] },
      lineage: [],
      project: { ...project, metadata: {} },
      source: { kind: "local", scope: "working-tree" },
    });

    expect(review.researchMotivation).toEqual({
      value: "unknown",
      linkStatus: "missing",
    });
    expect(review.linkedObjective).toEqual({
      value: "unknown",
      linkStatus: "missing",
    });
    expect(review.provenanceStatus).toBe("partial");
    expect(review.sections.flatMap((section) => section.findings)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          linkStatus: "missing",
          provenanceLabel: "missing provenance",
        }),
      ]),
    );
  });

  it("reports no research impact for unrelated documentation changes", () => {
    const review = analyzeResearchImpact({
      changeSet: {
        files: [
          {
            path: "docs/install.md",
            status: "modified",
            patch: "+Fix installation typo",
          },
        ],
        commits: [],
        truncated: false,
      },
      graph: researchGraphFixture,
      lineage: [verifiedLineage],
      project,
      source: { kind: "local", scope: "working-tree" },
    });

    expect(review.noResearchImpact).toBe(true);
    expect(
      review.sections
        .filter((section) => section.category !== "software")
        .flatMap((section) => section.findings),
    ).toEqual([]);
  });

  it("rejects malformed Git name-status data", () => {
    expect(() => parseGitNameStatus("M\0../outside\0")).toThrow(
      "Git returned a path outside the registered project",
    );
    expect(() => parseGitNameStatus("broken-record")).toThrow(
      "Git returned malformed change data",
    );
  });

  it("bounds large diffs and returns a partial result", async () => {
    const executor = vi.fn(async (_root: string, args: string[]) => {
      if (args.includes("--name-status"))
        return { stdout: "M\0src/method.ts\0" };
      if (args.includes("--format=%H%x00%s")) return { stdout: "" };
      const error = new Error("maxBuffer") as Error & { code: string };
      error.code = "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
      throw error;
    });

    const result = await collectGitChangeSet("/projects/alpha", {
      executor,
      maxDiffBytes: 128,
      source: { kind: "local", scope: "working-tree" },
    });

    expect(result).toMatchObject({
      truncated: true,
      files: [{ path: "src/method.ts", patch: "", status: "modified" }],
    });
  });

  it("keeps repository reads project-scoped", async () => {
    const repository = {
      getProject: vi.fn((projectId: string) => ({ ...project, id: projectId })),
      listProject: vi.fn(() => researchGraphFixture),
      listLineageSuggestions: vi.fn(() => [verifiedLineage]),
      listProvenance: vi.fn(() => []),
    };
    const collectChangeSet = vi.fn(async () => populatedChangeSet);

    const service = createPrImpactReviewService(repository, {
      collectChangeSet,
    });
    const review = await service.analyze("project-alpha", {
      kind: "local",
      scope: "working-tree",
    });

    expect(review.projectId).toBe("project-alpha");
    expect(repository.getProject).toHaveBeenCalledWith("project-alpha");
    expect(repository.listProject).toHaveBeenCalledWith("project-alpha");
    expect(repository.listLineageSuggestions).toHaveBeenCalledWith(
      "project-alpha",
    );
    expect(collectChangeSet).toHaveBeenCalledWith(
      "/projects/alpha",
      expect.any(Object),
    );
  });
});
