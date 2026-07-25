export type AnalysisTask = "auto" | "classification" | "regression";

export interface DatasetColumnProfile {
  name: string;
  kind: "numeric" | "categorical";
  missingCount: number;
  missingRate: number;
  uniqueCount: number;
}

export interface ParsedDataset {
  fileName: string;
  delimiter: "," | "\t" | ";";
  rowCount: number;
  columns: DatasetColumnProfile[];
  rows: Array<Record<string, string | null>>;
  warnings: string[];
}

export interface LocalAnalysisRequest {
  dataset: ParsedDataset;
  outcome: string;
  predictors: string[];
  task: AnalysisTask;
  folds: number;
  seed: number;
}

export interface AnalysisCoefficient {
  feature: string;
  value: number;
}

export interface LocalAnalysisResult {
  engineVersion: "cly-local-analysis-v1";
  task: Exclude<AnalysisTask, "auto">;
  outcome: string;
  predictors: string[];
  rowsUsed: number;
  rowsExcluded: number;
  folds: number;
  seed: number;
  metrics: Record<string, number>;
  coefficients: AnalysisCoefficient[];
  outcomeLevels?: [string, string];
  positiveClass?: string;
  warnings: string[];
  conclusion: string;
}

const MAX_ROWS = 50_000;
const MAX_COLUMNS = 200;
const MAX_ANALYSIS_ROWS = 5_000;
const MAX_PREDICTORS = 25;

const round = (value: number, digits = 6) => Number(value.toFixed(digits));

function detectDelimiter(text: string): ParsedDataset["delimiter"] {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  const counts = ([",", "\t", ";"] as const).map((delimiter) => ({
    delimiter,
    count: firstLine.split(delimiter).length - 1,
  }));
  counts.sort((a, b) => b.count - a.count);
  if (!counts[0]?.count) {
    throw new Error(
      "The dataset must be comma-, tab-, or semicolon-delimited.",
    );
  }
  return counts[0].delimiter;
}

function parseRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (character === delimiter && !quoted) {
      row.push(value.trim());
      value = "";
      continue;
    }
    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(value.trim());
      value = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      if (rows.length > MAX_ROWS + 1) break;
      continue;
    }
    value += character;
  }
  if (quoted) throw new Error("The dataset contains an unclosed quoted value.");
  row.push(value.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

const isFiniteNumber = (value: string | null) => {
  if (value === null || value.trim() === "") return false;
  return Number.isFinite(Number(value));
};

export function parseDelimitedDataset(
  text: string,
  fileName = "dataset.csv",
): ParsedDataset {
  if (!text.trim()) throw new Error("The selected dataset is empty.");
  const delimiter = detectDelimiter(text);
  const parsed = parseRows(text, delimiter);
  const rawHeaders = parsed.shift() ?? [];
  const headers = rawHeaders.map((header) => header.trim());
  if (headers.length < 2)
    throw new Error("The dataset must contain at least two columns.");
  if (headers.length > MAX_COLUMNS)
    throw new Error(`The beta supports at most ${MAX_COLUMNS} columns.`);
  if (headers.some((header) => !header))
    throw new Error("Every dataset column must have a header.");
  if (new Set(headers).size !== headers.length)
    throw new Error("Dataset column headers must be unique.");

  const warnings: string[] = [];
  const inconsistentRows = parsed.filter(
    (row) => row.length !== headers.length,
  );
  if (inconsistentRows.length) {
    warnings.push(
      `${inconsistentRows.length} row${inconsistentRows.length === 1 ? " has" : "s have"} a different number of fields; missing fields were treated as empty and extras were ignored.`,
    );
  }
  const truncated = parsed.length > MAX_ROWS;
  const dataRows = parsed.slice(0, MAX_ROWS);
  if (truncated)
    warnings.push(
      `Only the first ${MAX_ROWS.toLocaleString()} rows were analyzed in this beta.`,
    );

  const rows = dataRows.map((cells) =>
    Object.fromEntries(
      headers.map((header, index) => {
        const value = cells[index]?.trim() ?? "";
        return [header, value === "" ? null : value];
      }),
    ),
  );
  if (rows.length < 2) throw new Error("The dataset must contain data rows.");

  const columns = headers.map((name): DatasetColumnProfile => {
    const values = rows.map((row) => row[name]);
    const present = values.filter(
      (value): value is string => value !== null && value.trim() !== "",
    );
    const numeric = present.filter((value) => isFiniteNumber(value));
    return {
      name,
      kind:
        present.length > 0 && numeric.length / present.length >= 0.9
          ? "numeric"
          : "categorical",
      missingCount: values.length - present.length,
      missingRate: round((values.length - present.length) / values.length, 4),
      uniqueCount: new Set(present).size,
    };
  });

  return {
    fileName,
    delimiter,
    rowCount: rows.length,
    columns,
    rows,
    warnings,
  };
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function seededShuffle(length: number, seed: number) {
  const indices = Array.from({ length }, (_, index) => index);
  let state = seed >>> 0 || 1;
  const random = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
  for (let index = indices.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [indices[index], indices[target]] = [indices[target], indices[index]];
  }
  return indices;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

interface PreparedData {
  train: number[][];
  test: number[][];
  medians: number[];
  means: number[];
  deviations: number[];
}

function prepareFold(
  trainRows: Array<Array<number | null>>,
  testRows: Array<Array<number | null>>,
): PreparedData {
  const width = trainRows[0]?.length ?? 0;
  const medians = Array.from({ length: width }, (_, column) =>
    median(
      trainRows
        .map((row) => row[column])
        .filter((value): value is number => value !== null),
    ),
  );
  const impute = (rows: Array<Array<number | null>>) =>
    rows.map((row) => row.map((value, column) => value ?? medians[column]));
  const imputedTrain = impute(trainRows);
  const imputedTest = impute(testRows);
  const means = Array.from(
    { length: width },
    (_, column) =>
      imputedTrain.reduce((total, row) => total + row[column], 0) /
      imputedTrain.length,
  );
  const deviations = Array.from({ length: width }, (_, column) => {
    const variance =
      imputedTrain.reduce(
        (total, row) => total + (row[column] - means[column]) ** 2,
        0,
      ) / Math.max(1, imputedTrain.length - 1);
    return Math.sqrt(variance) || 1;
  });
  const standardize = (rows: number[][]) =>
    rows.map((row) =>
      row.map((value, column) => (value - means[column]) / deviations[column]),
    );
  return {
    train: standardize(imputedTrain),
    test: standardize(imputedTest),
    medians,
    means,
    deviations,
  };
}

const dot = (weights: number[], row: number[]) =>
  weights[0] +
  row.reduce((total, value, index) => total + value * weights[index + 1], 0);

function fitLogistic(features: number[][], outcome: number[]) {
  const weights = Array((features[0]?.length ?? 0) + 1).fill(0) as number[];
  const lambda = 0.002;
  for (let iteration = 0; iteration < 350; iteration += 1) {
    const gradient = Array(weights.length).fill(0) as number[];
    for (let rowIndex = 0; rowIndex < features.length; rowIndex += 1) {
      const linear = Math.max(
        -30,
        Math.min(30, dot(weights, features[rowIndex])),
      );
      const prediction = 1 / (1 + Math.exp(-linear));
      const error = prediction - outcome[rowIndex];
      gradient[0] += error;
      for (let column = 0; column < features[rowIndex].length; column += 1)
        gradient[column + 1] += error * features[rowIndex][column];
    }
    const rate = 0.12 / Math.sqrt(1 + iteration / 80);
    weights[0] -= (rate * gradient[0]) / features.length;
    for (let index = 1; index < weights.length; index += 1)
      weights[index] -=
        rate * (gradient[index] / features.length + lambda * weights[index]);
  }
  return weights;
}

function fitLinear(features: number[][], outcome: number[]) {
  const weights = Array((features[0]?.length ?? 0) + 1).fill(0) as number[];
  const lambda = 0.002;
  for (let iteration = 0; iteration < 500; iteration += 1) {
    const gradient = Array(weights.length).fill(0) as number[];
    for (let rowIndex = 0; rowIndex < features.length; rowIndex += 1) {
      const error = dot(weights, features[rowIndex]) - outcome[rowIndex];
      gradient[0] += error;
      for (let column = 0; column < features[rowIndex].length; column += 1)
        gradient[column + 1] += error * features[rowIndex][column];
    }
    const rate = 0.045 / Math.sqrt(1 + iteration / 120);
    weights[0] -= (rate * 2 * gradient[0]) / features.length;
    for (let index = 1; index < weights.length; index += 1)
      weights[index] -=
        rate *
        ((2 * gradient[index]) / features.length + lambda * weights[index]);
  }
  return weights;
}

function auc(outcome: number[], predictions: number[]) {
  const pairs = predictions
    .map((prediction, index) => ({ prediction, outcome: outcome[index] }))
    .sort((a, b) => a.prediction - b.prediction);
  const positives = outcome.filter((value) => value === 1).length;
  const negatives = outcome.length - positives;
  if (!positives || !negatives) return 0.5;
  let rankSum = 0;
  for (let index = 0; index < pairs.length; ) {
    let end = index + 1;
    while (
      end < pairs.length &&
      pairs[end].prediction === pairs[index].prediction
    )
      end += 1;
    const averageRank = (index + 1 + end) / 2;
    for (let cursor = index; cursor < end; cursor += 1)
      if (pairs[cursor].outcome === 1) rankSum += averageRank;
    index = end;
  }
  return (
    (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives)
  );
}

export function runLocalAnalysis(
  request: LocalAnalysisRequest,
): LocalAnalysisResult {
  const { dataset, outcome, predictors, seed } = request;
  const folds = Math.max(2, Math.min(10, Math.trunc(request.folds)));
  if (!dataset.columns.some((column) => column.name === outcome))
    throw new Error("Choose an outcome column from the imported dataset.");
  const uniquePredictors = [...new Set(predictors)].filter(
    (predictor) => predictor !== outcome,
  );
  if (!uniquePredictors.length)
    throw new Error("Choose at least one predictor that is not the outcome.");
  if (uniquePredictors.length > MAX_PREDICTORS)
    throw new Error(
      `The local beta supports at most ${MAX_PREDICTORS} predictors per run.`,
    );
  const unknown = uniquePredictors.filter(
    (predictor) => !dataset.columns.some((column) => column.name === predictor),
  );
  if (unknown.length)
    throw new Error(`Unknown predictor: ${unknown.join(", ")}.`);
  const nonNumeric = uniquePredictors.filter(
    (predictor) =>
      dataset.columns.find((column) => column.name === predictor)?.kind !==
      "numeric",
  );
  if (nonNumeric.length)
    throw new Error(
      `The local beta currently requires numeric predictors: ${nonNumeric.join(", ")}.`,
    );

  const outcomeValues = dataset.rows
    .map((row) => row[outcome])
    .filter((value): value is string => value !== null && value !== "");
  const levels = [...new Set(outcomeValues)].sort((a, b) => a.localeCompare(b));
  const inferredTask: Exclude<AnalysisTask, "auto"> =
    request.task === "auto"
      ? levels.length === 2
        ? "classification"
        : "regression"
      : request.task;
  if (inferredTask === "classification" && levels.length !== 2)
    throw new Error(
      "Binary classification requires exactly two outcome values.",
    );
  if (
    inferredTask === "regression" &&
    outcomeValues.some((value) => !isFiniteNumber(value))
  )
    throw new Error("Regression requires a numeric outcome column.");

  const outcomeLevels =
    inferredTask === "classification"
      ? ([levels[0], levels[1]] as [string, string])
      : undefined;
  const allUsable = dataset.rows.flatMap((row) => {
    const rawOutcome = row[outcome];
    if (rawOutcome === null) return [];
    const y =
      inferredTask === "classification"
        ? rawOutcome === outcomeLevels?.[1]
          ? 1
          : 0
        : Number(rawOutcome);
    if (!Number.isFinite(y)) return [];
    return [
      {
        y,
        x: uniquePredictors.map((predictor) => {
          const value = row[predictor];
          return isFiniteNumber(value) ? Number(value) : null;
        }),
      },
    ];
  });
  if (allUsable.length < Math.max(20, folds * 4))
    throw new Error(
      `At least ${Math.max(20, folds * 4)} usable rows are required for ${folds}-fold validation.`,
    );
  if (inferredTask === "classification") {
    const positive = allUsable.filter((row) => row.y === 1).length;
    const negative = allUsable.length - positive;
    if (Math.min(positive, negative) < folds)
      throw new Error(
        "Each outcome class must contain at least one row per fold.",
      );
  }

  const sampledIndices = seededShuffle(allUsable.length, seed).slice(
    0,
    MAX_ANALYSIS_ROWS,
  );
  const usable = sampledIndices.map((index) => allUsable[index]);

  const shuffled = seededShuffle(usable.length, seed);
  const predictions = Array(usable.length).fill(0) as number[];
  for (let fold = 0; fold < folds; fold += 1) {
    const testIndices = shuffled.filter((_, index) => index % folds === fold);
    const testSet = new Set(testIndices);
    const trainIndices = shuffled.filter((index) => !testSet.has(index));
    const prepared = prepareFold(
      trainIndices.map((index) => usable[index].x),
      testIndices.map((index) => usable[index].x),
    );
    const trainOutcome = trainIndices.map((index) => usable[index].y);
    const weights =
      inferredTask === "classification"
        ? fitLogistic(prepared.train, trainOutcome)
        : fitLinear(prepared.train, trainOutcome);
    testIndices.forEach((rowIndex, index) => {
      const linear = dot(weights, prepared.test[index]);
      predictions[rowIndex] =
        inferredTask === "classification"
          ? 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, linear))))
          : linear;
    });
  }

  const observed = usable.map((row) => row.y);
  const metrics: Record<string, number> = {};
  if (inferredTask === "classification") {
    const positiveRate =
      observed.reduce((total, value) => total + value, 0) / observed.length;
    const accuracy =
      predictions.filter(
        (prediction, index) => (prediction >= 0.5 ? 1 : 0) === observed[index],
      ).length / observed.length;
    const logLoss =
      -predictions.reduce((total, prediction, index) => {
        const bounded = Math.max(1e-12, Math.min(1 - 1e-12, prediction));
        return (
          total +
          observed[index] * Math.log(bounded) +
          (1 - observed[index]) * Math.log(1 - bounded)
        );
      }, 0) / observed.length;
    metrics.auc = round(auc(observed, predictions));
    metrics.accuracy = round(accuracy);
    metrics.baselineAccuracy = round(Math.max(positiveRate, 1 - positiveRate));
    metrics.logLoss = round(logLoss);
    metrics.positiveRate = round(positiveRate);
  } else {
    const mean =
      observed.reduce((total, value) => total + value, 0) / observed.length;
    const squaredErrors = predictions.map(
      (prediction, index) => (prediction - observed[index]) ** 2,
    );
    const absoluteErrors = predictions.map((prediction, index) =>
      Math.abs(prediction - observed[index]),
    );
    const totalSquares = observed.reduce(
      (total, value) => total + (value - mean) ** 2,
      0,
    );
    const residualSquares = squaredErrors.reduce(
      (total, value) => total + value,
      0,
    );
    metrics.rmse = round(Math.sqrt(residualSquares / observed.length));
    metrics.mae = round(
      absoluteErrors.reduce((total, value) => total + value, 0) /
        observed.length,
    );
    metrics.r2 = round(totalSquares ? 1 - residualSquares / totalSquares : 0);
    metrics.baselineRmse = round(
      Math.sqrt(
        observed.reduce((total, value) => total + (value - mean) ** 2, 0) /
          observed.length,
      ),
    );
  }
  metrics.rows = usable.length;
  metrics.features = uniquePredictors.length;

  const full = prepareFold(
    usable.map((row) => row.x),
    usable.map((row) => row.x),
  );
  const fullWeights =
    inferredTask === "classification"
      ? fitLogistic(full.train, observed)
      : fitLinear(full.train, observed);
  const coefficients = uniquePredictors
    .map((feature, index) => ({
      feature,
      value: round(fullWeights[index + 1]),
    }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  const warnings = [...dataset.warnings];
  if (usable.length < 100)
    warnings.push(
      "The usable sample contains fewer than 100 rows; estimates may be unstable.",
    );
  for (const predictor of uniquePredictors) {
    const profile = dataset.columns.find((column) => column.name === predictor);
    if (profile && profile.missingRate > 0.2)
      warnings.push(
        `${predictor} is missing in ${Math.round(profile.missingRate * 100)}% of rows and was median-imputed within each training fold.`,
      );
  }
  if (inferredTask === "classification" && metrics.positiveRate < 0.1)
    warnings.push(
      "The positive class is uncommon; accuracy may overstate useful performance.",
    );
  if (inferredTask === "classification" && metrics.positiveRate > 0.9)
    warnings.push(
      "The negative class is uncommon; accuracy may overstate useful performance.",
    );
  if (allUsable.length > MAX_ANALYSIS_ROWS)
    warnings.push(
      `A deterministic ${MAX_ANALYSIS_ROWS.toLocaleString()}-row sample was used for local beta performance; the dataset checksum still covers the full file.`,
    );
  if (allUsable.length !== dataset.rowCount)
    warnings.push(
      `${dataset.rowCount - allUsable.length} row${dataset.rowCount - allUsable.length === 1 ? " was" : "s were"} excluded because the outcome was missing or invalid.`,
    );
  warnings.push(
    "This is predictive association, not evidence of causation or clinical utility.",
    "Cross-validation is internal; an independent external dataset is still required.",
  );

  const conclusion =
    inferredTask === "classification"
      ? `Cross-validated AUC was ${metrics.auc.toFixed(3)} with ${Math.round(metrics.accuracy * 100)}% accuracy; the majority-class baseline was ${Math.round(metrics.baselineAccuracy * 100)}%.`
      : `Cross-validated RMSE was ${metrics.rmse.toFixed(3)} versus a mean-only baseline of ${metrics.baselineRmse.toFixed(3)} (R² ${metrics.r2.toFixed(3)}).`;

  return {
    engineVersion: "cly-local-analysis-v1",
    task: inferredTask,
    outcome,
    predictors: uniquePredictors,
    rowsUsed: usable.length,
    rowsExcluded: dataset.rowCount - allUsable.length,
    folds,
    seed,
    metrics,
    coefficients,
    outcomeLevels,
    positiveClass: outcomeLevels?.[1],
    warnings,
    conclusion,
  };
}
