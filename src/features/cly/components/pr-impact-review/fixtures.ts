import type { PrImpactReview } from "../../domain/pr-impact-review";

const finding = {
  id: "methodology-analysis-discordance",
  category: "methodology" as const,
  title: "Methodology review",
  summary: "The ApoB–LDL-C discordance threshold changed.",
  severity: "warning" as const,
  changedFiles: [{ path: "analysis/discordance.py", status: "modified" }],
  changedCommits: [
    { sha: "2222222", subject: "Make discordance threshold explicit" },
  ],
  commitLabel: "committed changes",
  researchObjects: [
    {
      id: "method-discordance",
      type: "method",
      label: "Weighted percentile discordance",
      linkStatus: "verified" as const,
    },
    {
      id: "claim-discordance",
      type: "claim",
      label: "Basic data flag discordantly high ApoB",
      linkStatus: "inferred" as const,
    },
  ],
  relationships: [
    {
      id: "evidence-method",
      type: "commit-experiment-link",
      fromObjectId: "2222222",
      toObjectId: "experiment-discordance",
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
    value: "Identify when LDL-C understates ApoB particle burden.",
    linkStatus: "verified",
  },
  linkedObjective: {
    value: "Validate the LDL-C discordance flag",
    linkStatus: "verified",
  },
  methodsChanged: finding.researchObjects.slice(0, 1),
  experimentsMayNeedRerun: [
    {
      id: "experiment-discordance",
      type: "experiment",
      label: "Discordance prediction benchmark",
      linkStatus: "verified",
    },
  ],
  affected: {
    claims: finding.researchObjects.slice(1),
    figuresAndArtifacts: [
      {
        id: "table-model-comparison",
        type: "table",
        label: "Model comparison table",
        linkStatus: "verified",
      },
    ],
    datasets: [],
  },
  risks: [
    "Target-leakage review is required before interpreting affected results.",
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
      id: "table-model-comparison",
      type: "table",
      label: "Model comparison table",
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
