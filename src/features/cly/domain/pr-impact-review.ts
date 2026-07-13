export type ImpactDiscipline =
  | "software"
  | "methodology"
  | "statistical"
  | "data-leakage"
  | "reproducibility"
  | "claim-impact";

export type ImpactLinkStatus = "verified" | "inferred" | "missing";

export interface ImpactResearchObject {
  id: string;
  type: string;
  label: string;
  linkStatus: ImpactLinkStatus;
}

export interface ImpactRelationship {
  id: string;
  type: string;
  fromObjectId: string;
  toObjectId: string;
  linkStatus: ImpactLinkStatus;
}

export interface ImpactFinding {
  id: string;
  category: ImpactDiscipline;
  title: string;
  summary: string;
  severity: "warning" | "blocking";
  changedFiles: Array<{ path: string; status: string }>;
  changedCommits: Array<{ sha: string; subject: string }>;
  commitLabel: string;
  researchObjects: ImpactResearchObject[];
  relationships: ImpactRelationship[];
  linkStatus: ImpactLinkStatus;
  provenanceLabel: string;
  humanApproval: "required" | "not-required";
}

export interface PrImpactReview {
  reviewId: string;
  projectId: string;
  source:
    | {
        kind: "local";
        scope: "working-tree" | "staged";
        baseRef?: string;
        headRef?: string;
      }
    | {
        kind: "pull-request";
        number: number;
        baseRef: string;
        headRef: string;
        state: "open" | "merged" | "closed";
        title?: string;
        url?: string;
      };
  generatedFrom: string;
  externalTransmission: false;
  researchMotivation: { value: string; linkStatus: ImpactLinkStatus };
  linkedObjective: { value: string; linkStatus: ImpactLinkStatus };
  methodsChanged: ImpactResearchObject[];
  experimentsMayNeedRerun: ImpactResearchObject[];
  affected: {
    claims: ImpactResearchObject[];
    figuresAndArtifacts: ImpactResearchObject[];
    datasets: ImpactResearchObject[];
  };
  risks: string[];
  unresolvedAssumptions: string[];
  sections: Array<{
    category: ImpactDiscipline;
    title: string;
    findings: ImpactFinding[];
  }>;
  validationChecklist: Array<{
    id: string;
    discipline: ImpactDiscipline | "human-approval";
    label: string;
    status: "pending" | "complete" | "not-applicable";
    evidenceRequired: boolean;
  }>;
  downstreamImpact: Array<
    ImpactResearchObject & {
      state: "needs-review" | "would-need-review-after-merge";
      recommendedAction: string;
    }
  >;
  approval: null | {
    actorId: string;
    decision: "approved" | "rejected";
    reviewedAt: string;
    confirmedLinkIds: string[];
  };
  requiresHumanApproval: boolean;
  noResearchImpact: boolean;
  provenanceStatus: "complete" | "partial";
  partialReasons: string[];
  caveats: string[];
}
