import type {
  Experiment,
  PreregistrationComparison,
  PreregistrationContent,
} from "./types";

const contentKeys = [
  "hypothesis",
  "primaryMetrics",
  "exclusionRules",
  "analysisPlan",
  "successCriteria",
  "dataset",
  "intendedDesign",
] as const;

const sameValue = (left: string | string[], right: string | string[]) =>
  JSON.stringify(left) === JSON.stringify(right);

export function comparePreregistration(
  snapshot: PreregistrationContent,
  current: PreregistrationContent,
): PreregistrationComparison[] {
  return contentKeys.flatMap((key) =>
    sameValue(snapshot[key], current[key])
      ? []
      : [
          {
            fieldPath: `/${key}` as const,
            beforeValue: snapshot[key],
            afterValue: current[key],
          },
        ],
  );
}

export function createPreregistrationTemplate(
  experiment: Experiment,
): PreregistrationContent {
  const hypothesis =
    experiment.hypothesis && experiment.hypothesis !== "To be specified"
      ? experiment.hypothesis
      : `${experiment.goal} will improve the primary outcome.`;
  return {
    hypothesis,
    primaryMetrics: ["Primary outcome"],
    exclusionRules:
      "Exclude only records that fail documented data-quality checks.",
    analysisPlan:
      "Estimate the primary effect with the intended design and report uncertainty.",
    successCriteria: "The primary metric meets the prespecified target.",
    dataset:
      experiment.dataset && experiment.dataset !== "Not linked"
        ? experiment.dataset
        : "Primary analysis dataset",
    intendedDesign: experiment.type,
  };
}
