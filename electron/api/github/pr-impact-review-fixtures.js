export const verifiedLineage = {
  id: "lineage-verified",
  projectId: "project-alpha",
  reviewState: "approved",
  origin: "inferred",
  chain: [
    {
      kind: "objective",
      id: "objective-calibration",
      label: "Improve calibrated uncertainty",
      coordinates: {},
    },
    {
      kind: "notebook",
      id: "notebooks/calibration.ipynb",
      label: "Calibration analysis",
      coordinates: { path: "notebooks/calibration.ipynb" },
    },
    {
      kind: "commit",
      id: "1111111",
      label: "Add calibrated uncertainty baseline",
      coordinates: { sha: "1111111" },
    },
    {
      kind: "experiment",
      id: "experiment-calibration",
      label: "Calibration sweep",
      coordinates: { path: "experiments/calibration.yaml" },
    },
    {
      kind: "artifact",
      id: "figure-calibration",
      label: "Calibration Figure",
      coordinates: { path: "reports/figures/calibration.pdf" },
    },
    {
      kind: "claim",
      id: "claim-calibration",
      label: "Calibration improves interval reliability",
      coordinates: { path: "reports/results.md" },
    },
  ],
  evidence: [
    {
      id: "evidence-method",
      evidenceType: "commit-experiment-link",
      path: "src/methods/calibration.ts",
      coordinates: {},
      contentHash: "a".repeat(64),
    },
    {
      id: "evidence-artifact",
      evidenceType: "experiment-artifact-link",
      path: "experiments/calibration.yaml",
      coordinates: {},
      contentHash: "b".repeat(64),
    },
    {
      id: "evidence-claim",
      evidenceType: "artifact-claim-link",
      path: "reports/results.md",
      coordinates: {},
      contentHash: "c".repeat(64),
    },
  ],
};

export const inferredLineage = {
  ...verifiedLineage,
  id: "lineage-inferred",
  reviewState: "unreviewed",
  chain: verifiedLineage.chain.map((step) => ({
    ...step,
    id: `${step.id}-inferred`,
  })),
  evidence: verifiedLineage.evidence.map((item) => ({
    ...item,
    id: `${item.id}-inferred`,
  })),
};

export const researchGraphFixture = {
  objects: [
    {
      id: "method-calibration",
      projectId: "project-alpha",
      type: "method",
      title: "Temperature calibration",
      description: "Calibrates predictive intervals.",
      payload: { kind: "method", path: "src/methods/calibration.ts" },
      reviewState: "approved",
      origin: "human",
    },
    {
      id: "dataset-cylinder-v2",
      projectId: "project-alpha",
      type: "dataset",
      title: "Cylinder flow v2",
      description: "Canonical train and evaluation splits.",
      payload: { kind: "dataset", path: "data/splits/cylinder-v2.json" },
      reviewState: "approved",
      origin: "human",
    },
  ],
  relationships: [
    {
      id: "relationship-method-dataset",
      projectId: "project-alpha",
      fromObjectId: "method-calibration",
      toObjectId: "dataset-cylinder-v2",
      type: "uses",
      reviewState: "approved",
      origin: "human",
    },
  ],
};

export const populatedChangeSet = {
  files: [
    {
      path: "src/methods/calibration.ts",
      status: "modified",
      patch:
        "-const threshold = 0.10;\n+const threshold = 0.05;\n+const split = dataset.test;",
    },
    {
      path: "experiments/calibration.yaml",
      status: "modified",
      patch: "-seed: 7\n+seed: 19",
    },
    {
      path: "reports/results.md",
      status: "modified",
      patch: "+The calibrated method improves coverage.",
    },
  ],
  commits: [{ sha: "2222222", subject: "Change calibration threshold" }],
  truncated: false,
};

export const missingProvenanceChangeSet = {
  files: [
    {
      path: "src/legacy/unknown_method.py",
      status: "modified",
      patch: "+def transform(dataset):\n+    return dataset",
    },
  ],
  commits: [],
  truncated: false,
};
