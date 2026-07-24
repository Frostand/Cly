import { describe, expect, it } from "vitest";
import { createFixtureRepository } from "../fixtures/repository";
import { generateReproducibilityAudit } from "./reproducibility-audit";

describe("generateReproducibilityAudit", () => {
  it("reports contradictions, failed evidence, unpinned environments, and stale outputs", () => {
    const data = createFixtureRepository("active");
    data.claims = data.claims.map((claim) =>
      claim.id === "claim-02"
        ? { ...claim, contradictingSourceIds: ["src-04"] }
        : claim,
    );
    data.experiments = data.experiments.map((experiment) =>
      experiment.id === "exp-03"
        ? { ...experiment, status: "Failed" }
        : experiment,
    );
    data.artifacts = data.artifacts.map((artifact) =>
      artifact.id === "artifact-03"
        ? { ...artifact, regeneration: "Broken" }
        : artifact,
    );
    const result = generateReproducibilityAudit(
      data,
      "2026-07-14T12:00:00.000Z",
    );

    expect(result.audit.id).toBe("audit-20260714120000");
    expect(result.audit.areas?.map((area) => area.area)).toEqual([
      "Code",
      "Data",
      "Environment",
      "Experiments",
      "Outputs",
      "Claims",
    ]);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          area: "Claims",
          severity: "Blocking",
          objectIds: expect.arrayContaining(["claim-02", "src-04"]),
        }),
        expect.objectContaining({
          area: "Experiments",
          severity: "Blocking",
          objectIds: expect.arrayContaining(["exp-03", "claim-01"]),
        }),
        expect.objectContaining({
          area: "Environment",
          objectIds: expect.arrayContaining(["exp-03"]),
        }),
        expect.objectContaining({
          area: "Outputs",
          objectIds: expect.arrayContaining(["artifact-03", "claim-02"]),
        }),
      ]),
    );
    expect(result.audit.score).toBeLessThan(70);
  });

  it("marks an otherwise ready output stale when an upstream experiment changed", () => {
    const data = createFixtureRepository("active");
    data.artifacts = [
      {
        ...data.artifacts[0],
        regeneration: "Ready",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
    ];
    data.experiments = data.experiments.map((experiment) =>
      experiment.id === data.artifacts[0].experimentId
        ? { ...experiment, updatedAt: "2026-07-02T00:00:00.000Z" }
        : experiment,
    );

    const result = generateReproducibilityAudit(
      data,
      "2026-07-14T12:00:00.000Z",
    );

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        id: `audit-outputs-stale-${data.artifacts[0].id}`,
        detail:
          "A linked experiment or generator changed after this output was produced.",
      }),
    );
  });

  it("uses stable finding ids for repeatable audit comparisons", () => {
    const data = createFixtureRepository("active");
    const first = generateReproducibilityAudit(
      data,
      "2026-07-14T12:00:00.000Z",
    );
    const second = generateReproducibilityAudit(
      data,
      "2026-07-15T12:00:00.000Z",
    );

    expect(first.findings.map((finding) => finding.id)).toEqual(
      second.findings.map((finding) => finding.id),
    );
  });

  it("never labels an audit with an open blocker as mostly reproducible", () => {
    const result = generateReproducibilityAudit(
      createFixtureRepository("empty"),
      "2026-07-14T12:00:00.000Z",
    );

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "No research objects are available to audit",
          severity: "Blocking",
        }),
      ]),
    );
    expect(result.audit.status).toBe("Not reproducible");
  });
});
