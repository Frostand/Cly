import type {
  ClyRepositoryData,
  CostAggregate,
  CostLedger,
  ResearchProject,
} from "../domain/types";

const now = new Date().toISOString();

/**
 * Minimal boot state used before the project-scoped SQLite repository hydrates.
 * It intentionally contains no research records or provider/integration state.
 */
export const productionProjects: ResearchProject[] = [
  {
    id: "project-cly",
    name: "Local research project",
    path: "~/Research/cly",
    question: "Define the research question for this project.",
    hypothesis: "Define the working hypothesis for this project.",
    phase: "Exploration",
    description: "Project-scoped local research workspace.",
    localOnly: true,
    updatedAt: now,
  },
];

export const emptyCostAggregate = (): CostAggregate => ({
  categorizedTotals: [],
  conversionState: "empty",
  totals: [],
});

export const emptyCostLedger = (): CostLedger => ({
  ...emptyCostAggregate(),
  entries: [],
  waste: { ...emptyCostAggregate(), entryCount: 0 },
});

export function createProductionRepository(
  projects: ResearchProject[] = productionProjects,
): ClyRepositoryData {
  return {
    projects,
    sources: [],
    claims: [],
    experiments: [],
    runs: [],
    notebooks: [],
    code: [],
    artifacts: [],
    findings: [],
    audits: [],
    integrations: [],
    nextSteps: [],
    decisions: [],
    contextItems: [],
    contextPacks: [],
    agentPresets: [],
    agentSessions: [],
    graphNodes: [],
    graphEdges: [],
    reports: [],
    activity: [],
  };
}
