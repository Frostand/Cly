import type { PrImpactReview } from "../../domain/pr-impact-review";

const finding = {
  id: "methodology-src-methods-calibration",
  category: "methodology" as const,
  title: "Methodology review",
  summary: "A calibration threshold changed.",
  severity: "warning" as const,
  changedFiles: [{ path: "src/methods/calibration.ts", status: "modified" }],
  changedCommits: [{ sha: "2222222", subject: "Change calibration threshold" }],
  commitLabel: "committed changes",
  researchObjects: [
    {
      id: "method-calibration",
      type: "method",
      label: "Temperature calibration",
      linkStatus: "verified" as const,
    },
    {
      id: "claim-calibration",
      type: "claim",
      label: "Calibration improves interval reliability",
      linkStatus: "inferred" as const,
    },
  ],
  relationships: [
    {
      id: "evidence-method",
      type: "commit-experiment-link",
      fromObjectId: "2222222",
      toObjectId: "experiment-calibration",
      linkStatus: "verified" as const,
    },
  ],
  linkStatus: "inferred" as const,
  provenanceLabel: "inferred link — human review required",
  humanApproval: "required" as const,
};

export const populatedPrImpactReviewFixture: PrImpactReview = {
  reviewId: "a".repeat(64),
  projectId: "project-cly",
  source: {
    kind: "pull-request",
    number: 60,
    baseRef: "main",
    headRef: "codex/cly-60-pr-impact-review",
    state: "open",
  },
  generatedFrom: "local-git-and-project-provenance",
  externalTransmission: false,
  researchMotivation: {
    value: "Make uncertainty estimates reliable under shift.",
    linkStatus: "verified",
  },
  linkedObjective: {
    value: "Improve calibrated uncertainty",
    linkStatus: "verified",
  },
  methodsChanged: finding.researchObjects.slice(0, 1),
  experimentsMayNeedRerun: [
    {
      id: "experiment-calibration",
      type: "experiment",
      label: "Calibration sweep",
      linkStatus: "verified",
    },
  ],
  affected: {
    claims: finding.researchObjects.slice(1),
    figuresAndArtifacts: [
      {
        id: "figure-calibration",
        type: "figure",
        label: "Calibration Figure",
        linkStatus: "verified",
      },
    ],
    datasets: [],
  },
  risks: [
    "Data-leakage review is required before interpreting affected results.",
  ],
  unresolvedAssumptions: [
    "Inferred relationships have not been verified by a human.",
  ],
  sections: [
    {
      category: "software",
      title: "Software checks",
      findings: [
        {
          ...finding,
          id: "software",
          category: "software",
          title: "Software checks",
          humanApproval: "not-required",
        },
      ],
    },
    {
      category: "methodology",
      title: "Methodology review",
      findings: [finding],
    },
    {
      category: "statistical",
      title: "Statistical review",
      findings: [
        {
          ...finding,
          id: "statistical",
          category: "statistical",
          title: "Statistical review",
        },
      ],
    },
    {
      category: "data-leakage",
      title: "Data-leakage review",
      findings: [
        {
          ...finding,
          id: "leakage",
          category: "data-leakage",
          title: "Data-leakage review",
          severity: "blocking",
        },
      ],
    },
    {
      category: "reproducibility",
      title: "Reproducibility review",
      findings: [
        {
          ...finding,
          id: "reproducibility",
          category: "reproducibility",
          title: "Reproducibility review",
        },
      ],
    },
    {
      category: "claim-impact",
      title: "Claim-impact review",
      findings: [
        {
          ...finding,
          id: "claim-impact",
          category: "claim-impact",
          title: "Claim-impact review",
        },
      ],
    },
  ],
  validationChecklist: [
    {
      id: "validate-software",
      discipline: "software",
      label: "Run relevant software tests and static checks",
      status: "pending",
      evidenceRequired: true,
    },
    {
      id: "validate-human-approval",
      discipline: "human-approval",
      label:
        "Record explicit human review of scientific conflicts and inferred links",
      status: "pending",
      evidenceRequired: true,
    },
  ],
  downstreamImpact: [
    {
      id: "figure-calibration",
      type: "figure",
      label: "Calibration Figure",
      linkStatus: "verified",
      state: "would-need-review-after-merge",
      recommendedAction:
        "Review or regenerate this downstream object after merge.",
    },
  ],
  approval: null,
  requiresHumanApproval: true,
  noResearchImpact: false,
  provenanceStatus: "partial",
  partialReasons: ["unreviewed inferred relationships"],
  caveats: [
    "This deterministic review identifies possible impact; it does not establish scientific correctness.",
    "Inferred relationships are suggestions until a human reviews them.",
  ],
};

export const emptyPrImpactReviewFixture: PrImpactReview = {
  ...populatedPrImpactReviewFixture,
  reviewId: "b".repeat(64),
  methodsChanged: [],
  experimentsMayNeedRerun: [],
  affected: { claims: [], figuresAndArtifacts: [], datasets: [] },
  risks: [],
  unresolvedAssumptions: [],
  sections: populatedPrImpactReviewFixture.sections.map((section) => ({
    ...section,
    findings: section.category === "software" ? section.findings : [],
  })),
  validationChecklist: [],
  downstreamImpact: [],
  requiresHumanApproval: false,
  noResearchImpact: true,
  provenanceStatus: "complete",
  partialReasons: [],
};
