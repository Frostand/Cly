import { createHash } from "node:crypto";

export const NOTEBOOK_SCANNER_VERSION = "notebook-static-v1";

const MAX_CELLS = 5_000;
const MAX_OUTPUTS_PER_CELL = 100;
const MAX_TOTAL_OUTPUTS = 10_000;
const MAX_GRAPH_OBJECTS = 25_000;
const MAX_GRAPH_RELATIONSHIPS = 50_000;
const MAX_RISKS = 10_000;
const MAX_SOURCE_CHARACTERS = 1_000_000;
const MAX_EXCERPT_CHARACTERS = 500;
const LARGE_EMBEDDED_OUTPUT_CHARACTERS = 256 * 1024;

const STANDARD_LIBRARY_MODULES = new Set([
  "argparse",
  "asyncio",
  "collections",
  "contextlib",
  "csv",
  "dataclasses",
  "datetime",
  "functools",
  "glob",
  "hashlib",
  "itertools",
  "json",
  "logging",
  "math",
  "os",
  "pathlib",
  "pickle",
  "random",
  "re",
  "shutil",
  "statistics",
  "string",
  "subprocess",
  "sys",
  "tempfile",
  "time",
  "typing",
  "uuid",
]);

const RANDOM_USE_PATTERN =
  /\b(?:np|numpy)\.random\.|\brandom\.(?:random|randint|choice|shuffle|sample|uniform)\s*\(|\b(?:train_test_split|KFold|StratifiedKFold|shuffle)\s*\(/;
const RANDOM_SEED_PATTERN =
  /\b(?:np|numpy)\.random\.seed\s*\(|\brandom\.seed\s*\(|\brandom_state\s*=\s*[^,)\s]+|\bseed\s*=\s*[^,)\s]+/;
const ABSOLUTE_PATH_PATTERN =
  /(?:["'])(\/[^"'\n]+|[A-Za-z]:\\[^"'\n]+)(?:["'])/g;

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hash = (...parts) =>
  createHash("sha256").update(parts.join("\u0000")).digest("hex");

const stableId = (kind, ...parts) =>
  `${kind}_${hash(NOTEBOOK_SCANNER_VERSION, kind, ...parts).slice(0, 32)}`;

const normalizeSource = (source) => {
  const value = Array.isArray(source)
    ? source.every((part) => typeof part === "string")
      ? source.join("")
      : null
    : typeof source === "string"
      ? source
      : null;
  if (value === null) throw new Error("Notebook cell source must be text.");
  if (value.length > MAX_SOURCE_CHARACTERS) {
    throw new Error("Notebook cell source exceeds the static scan limit.");
  }
  return value.replaceAll("\r\n", "\n");
};

const excerpt = (value) =>
  value.replace(/\s+/g, " ").trim().slice(0, MAX_EXCERPT_CHARACTERS);

const safeMetadata = (metadata) => {
  if (!isRecord(metadata)) return {};
  const tags = Array.isArray(metadata.tags)
    ? metadata.tags
        .filter((tag) => typeof tag === "string")
        .slice(0, 100)
        .map((tag) => tag.slice(0, 200))
    : [];
  return {
    tags,
    collapsed: metadata.collapsed === true,
    hidden: metadata.hidden === true || tags.includes("hide-input"),
  };
};

const outputText = (output) => {
  if (!isRecord(output)) return "";
  if (typeof output.text === "string") return output.text;
  if (Array.isArray(output.text)) {
    return output.text.filter((part) => typeof part === "string").join("");
  }
  if (typeof output.evalue === "string") return output.evalue;
  return "";
};

const outputDataEntries = (output) => {
  if (!isRecord(output?.data)) return [];
  const entries = Object.entries(output.data);
  if (entries.length > 100) {
    throw new Error("Notebook output exceeds the MIME entry scan limit.");
  }
  return entries
    .filter(([mimeType, value]) => {
      if (typeof mimeType !== "string" || mimeType.length > 200) return false;
      return (
        typeof value === "string" ||
        (Array.isArray(value) &&
          value.every((part) => typeof part === "string"))
      );
    })
    .map(([mimeType, value]) => [
      mimeType,
      Array.isArray(value) ? value.join("") : value,
    ]);
};

const evidenceForCell = (notebookPath, cellIndex, source, locator) => ({
  kind: "notebook-cell",
  path: notebookPath,
  locator: locator ?? `cells/${cellIndex}`,
  excerpt: excerpt(source),
  contentHash: hash(source),
});

const parseImports = (source) => {
  const imports = new Set();
  for (const line of source.split("\n").slice(0, 20_000)) {
    const importMatch = line.match(/^\s*import\s+([A-Za-z_][\w.]*)/);
    const fromMatch = line.match(/^\s*from\s+([A-Za-z_][\w.]*)\s+import\s+/);
    const moduleName = (importMatch?.[1] ?? fromMatch?.[1])?.split(".")[0];
    if (moduleName) imports.add(moduleName);
  }
  return [...imports].sort();
};

const parseFunctions = (source) => {
  const functions = new Set();
  for (const line of source.split("\n").slice(0, 20_000)) {
    const match = line.match(
      /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(|^\s*function\s+([A-Za-z_$][\w$]*)\s*\(/,
    );
    const name = match?.[1] ?? match?.[2];
    if (name) functions.add(name);
  }
  return [...functions].sort();
};

const parseParameters = (source) => {
  const parameters = [];
  for (const line of source.split("\n").slice(0, 20_000)) {
    const match = line.match(
      /^\s*([A-Za-z_]\w*)\s*=\s*(-?\d+(?:\.\d+)?|true|false|True|False|None|null|["'][^"'\n]{0,200}["'])\s*(?:#.*)?$/,
    );
    if (!match) continue;
    parameters.push({ name: match[1], value: match[2].slice(0, 250) });
    if (parameters.length >= 200) break;
  }
  return parameters;
};

const parseDatasets = (source) => {
  const datasets = new Set();
  const pattern =
    /\b(?:read_csv|read_parquet|read_json|read_excel|load_dataset|loadtxt|genfromtxt|open)\s*\(\s*["']([^"'\n]{1,1000})["']/g;
  for (const match of source.matchAll(pattern)) datasets.add(match[1]);
  return [...datasets].sort();
};

const parseMetrics = (source) => {
  const metrics = [];
  for (const line of source.split("\n").slice(0, 20_000)) {
    const assignment = line.match(
      /^\s*([A-Za-z_]\w*(?:accuracy|auc|f1|loss|mae|mape|mse|precision|recall|rmse|r2|score)[A-Za-z_\d]*)\s*=\s*(.+)$/i,
    );
    if (assignment) {
      metrics.push({ name: assignment[1], expression: excerpt(assignment[2]) });
    }
    if (metrics.length >= 200) break;
  }
  return metrics;
};

const declaredDependencies = (metadata) => {
  const values = new Set();
  const candidates = [
    metadata?.dependencies,
    metadata?.requirements,
    metadata?.cly?.dependencies,
  ];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    for (const item of candidate) {
      if (typeof item !== "string") continue;
      const name = item
        .trim()
        .split(/[<>=!~\s[]/, 1)[0]
        .replaceAll("-", "_");
      if (name) values.add(name.toLowerCase());
    }
  }
  return values;
};

const extractLabeledMarkdown = (source, label) => {
  const lines = source.split("\n");
  const values = [];
  const matcher = new RegExp(`^(?:#{1,6}\\s*)?${label}\\s*:?\\s*(.*)$`, "i");
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].trim().match(matcher);
    if (!match) continue;
    const inline = match[1].trim();
    const next =
      lines
        .slice(index + 1)
        .find((line) => line.trim())
        ?.trim() ?? "";
    const value = (inline || next).replace(/^[-*]\s*/, "").slice(0, 2_000);
    if (value) values.push(value);
  }
  return [...new Set(values)];
};

export function scanNotebookDocument(
  document,
  { contentHash, notebookPath, projectId },
) {
  if (!isRecord(document)) throw new Error("Notebook must be a JSON object.");
  if (!Array.isArray(document.cells)) {
    throw new Error("Notebook must contain a cells array.");
  }
  if (document.cells.length > MAX_CELLS) {
    throw new Error("Notebook exceeds the static cell scan limit.");
  }
  if (!Number.isInteger(document.nbformat) || document.nbformat < 4) {
    throw new Error("Notebook nbformat must be version 4 or newer.");
  }

  const notebookId = stableId("notebook", projectId, notebookPath);
  const objects = [];
  const relationships = [];
  const risks = [];
  const cellRecords = [];
  const codeSources = [];
  const dependencyCells = new Map();
  const datasetCells = new Map();
  const methodCells = new Map();
  const metricCells = [];
  const experimentCells = [];
  const objectives = [];
  const claims = [];
  const executionCounts = [];
  let hasExecutionError = false;
  let totalOutputCount = 0;
  const riskIds = new Set();

  const addObject = (object) => objects.push({ ...object, origin: "inferred" });
  const addRelationship = (fromObjectId, toObjectId, type, evidence) => {
    relationships.push({
      id: stableId("relationship", projectId, fromObjectId, type, toObjectId),
      fromObjectId,
      toObjectId,
      type,
      origin: "inferred",
      verificationState: "unverified",
      evidence: [evidence],
    });
  };
  const addRisk = (
    rule,
    severity,
    message,
    cellIndex,
    source,
    details = {},
  ) => {
    const key = `${rule}:${cellIndex ?? "notebook"}:${JSON.stringify(details)}`;
    const id = stableId("risk", projectId, notebookPath, key);
    if (riskIds.has(id)) return;
    if (riskIds.size >= MAX_RISKS) {
      throw new Error("Notebook exceeds the static risk scan limit.");
    }
    riskIds.add(id);
    const evidence = evidenceForCell(
      notebookPath,
      cellIndex ?? 0,
      source,
      cellIndex === null ? "notebook" : undefined,
    );
    risks.push({ id, rule, severity, message, cellIndex, evidence });
    addObject({
      id,
      type: "risk",
      title: message,
      description:
        "Static notebook risk; review before trusting notebook results.",
      payload: {
        kind: "risk",
        notebookId,
        rule,
        severity,
        cellIndex,
        details,
        scannerVersion: NOTEBOOK_SCANNER_VERSION,
      },
    });
    addRelationship(notebookId, id, "has-risk", evidence);
  };

  const rawCellIds = document.cells.map((cell) =>
    typeof cell?.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(cell.id)
      ? cell.id
      : null,
  );
  const duplicateCellIds = new Set(
    rawCellIds.filter(
      (value, index) => value && rawCellIds.indexOf(value) !== index,
    ),
  );

  for (let cellIndex = 0; cellIndex < document.cells.length; cellIndex += 1) {
    const cell = document.cells[cellIndex];
    if (
      !isRecord(cell) ||
      !["code", "markdown", "raw"].includes(cell.cell_type)
    ) {
      throw new Error(`Notebook cell ${cellIndex} has an unsupported shape.`);
    }
    const source = normalizeSource(cell.source ?? "");
    const sourceHash = hash(source);
    const logicalCellKey =
      rawCellIds[cellIndex] && !duplicateCellIds.has(rawCellIds[cellIndex])
        ? `jupyter:${rawCellIds[cellIndex]}`
        : `index:${cellIndex}`;
    const cellId = stableId("cell", projectId, notebookPath, logicalCellKey);
    const executionCount = Number.isInteger(cell.execution_count)
      ? cell.execution_count
      : null;
    if (
      cell.cell_type === "code" &&
      cell.execution_count !== null &&
      cell.execution_count !== undefined &&
      (!Number.isInteger(cell.execution_count) || cell.execution_count < 1)
    ) {
      throw new Error(
        `Notebook cell ${cellIndex} has an invalid execution count.`,
      );
    }
    const metadata = safeMetadata(cell.metadata);
    const imports = cell.cell_type === "code" ? parseImports(source) : [];
    const functions = cell.cell_type === "code" ? parseFunctions(source) : [];
    const parameters = cell.cell_type === "code" ? parseParameters(source) : [];
    const datasets = cell.cell_type === "code" ? parseDatasets(source) : [];
    const metrics = cell.cell_type === "code" ? parseMetrics(source) : [];
    const outputs = cell.cell_type === "code" ? (cell.outputs ?? []) : [];
    if (!Array.isArray(outputs) || outputs.length > MAX_OUTPUTS_PER_CELL) {
      throw new Error(
        `Notebook cell ${cellIndex} exceeds the output scan limit.`,
      );
    }

    const evidence = evidenceForCell(notebookPath, cellIndex, source);
    const cellRecord = {
      id: cellId,
      index: cellIndex,
      source,
      sourceHash,
      executionCount,
      cellType: cell.cell_type,
      evidence,
    };
    cellRecords.push(cellRecord);
    if (cell.cell_type === "code") {
      codeSources.push(source);
      if (executionCount !== null)
        executionCounts.push({ cellIndex, executionCount });
    }

    addObject({
      id: cellId,
      type: "notebook-cell",
      title: `${cell.cell_type === "code" ? "Code" : cell.cell_type === "markdown" ? "Markdown" : "Raw"} cell ${cellIndex + 1}`,
      description: excerpt(source),
      payload: {
        kind: "notebook-cell",
        notebookId,
        index: cellIndex,
        jupyterCellId: rawCellIds[cellIndex],
        cellType: cell.cell_type,
        sourceHash,
        executionCount,
        imports,
        functions,
        parameters,
        datasets,
        metrics,
        sourcePreview: source.slice(0, 4_000),
        sourceTruncated: source.length > 4_000,
        metadata,
        untrusted: true,
        scannerVersion: NOTEBOOK_SCANNER_VERSION,
      },
    });
    addRelationship(notebookId, cellId, "contains", evidence);

    for (const moduleName of imports) {
      const values = dependencyCells.get(moduleName) ?? [];
      values.push({ cellId, evidence });
      dependencyCells.set(moduleName, values);
    }
    for (const dataset of datasets) {
      const values = datasetCells.get(dataset) ?? [];
      values.push({ cellId, evidence });
      datasetCells.set(dataset, values);
    }
    for (const functionName of functions) {
      const values = methodCells.get(functionName) ?? [];
      values.push({ cellId, evidence });
      methodCells.set(functionName, values);
    }
    for (const metric of metrics)
      metricCells.push({ cellId, evidence, metric });

    if (cell.cell_type === "markdown") {
      for (const value of extractLabeledMarkdown(source, "objective")) {
        objectives.push({ value, evidence });
      }
      for (const value of extractLabeledMarkdown(source, "claim")) {
        claims.push({ value, evidence });
      }
    }
    if (
      cell.cell_type === "code" &&
      /\.(?:fit|train|evaluate)\s*\(|\b(?:fit|train|evaluate)_model\s*\(/i.test(
        source,
      )
    ) {
      experimentCells.push({ cellId, cellIndex, evidence });
    }

    for (let outputIndex = 0; outputIndex < outputs.length; outputIndex += 1) {
      totalOutputCount += 1;
      if (totalOutputCount > MAX_TOTAL_OUTPUTS) {
        throw new Error("Notebook exceeds the total output scan limit.");
      }
      const output = outputs[outputIndex];
      if (!isRecord(output) || typeof output.output_type !== "string") {
        throw new Error(
          `Notebook output ${cellIndex}:${outputIndex} is invalid.`,
        );
      }
      const dataEntries = outputDataEntries(output);
      const text = outputText(output);
      const serializedSize = dataEntries.reduce(
        (total, [, value]) => total + value.length,
        text.length,
      );
      if (serializedSize > LARGE_EMBEDDED_OUTPUT_CHARACTERS) {
        addRisk(
          "large-embedded-output",
          "medium",
          `Cell ${cellIndex + 1} contains an excessively large embedded output.`,
          cellIndex,
          source,
          { outputIndex, characterCount: serializedSize },
        );
      }
      const outputExecutionCount = Number.isInteger(output.execution_count)
        ? output.execution_count
        : null;
      if (
        output.execution_count !== null &&
        output.execution_count !== undefined &&
        (!Number.isInteger(output.execution_count) ||
          output.execution_count < 1)
      ) {
        throw new Error(
          `Notebook output ${cellIndex}:${outputIndex} has an invalid execution count.`,
        );
      }
      if (
        executionCount !== null &&
        outputExecutionCount !== null &&
        executionCount !== outputExecutionCount
      ) {
        addRisk(
          "code-output-mismatch",
          "high",
          `Cell ${cellIndex + 1} output execution count does not match its code cell.`,
          cellIndex,
          source,
          { executionCount, outputExecutionCount, outputIndex },
        );
      }
      const dataMimeTypes = dataEntries.map(([mimeType]) => mimeType);
      const hasImage = dataMimeTypes.some((mimeType) =>
        mimeType.startsWith("image/"),
      );
      const hasTable =
        dataMimeTypes.includes("application/vnd.dataresource+json") ||
        dataEntries.some(
          ([mimeType, value]) =>
            mimeType === "text/html" && /<table[\s>]/i.test(value),
        );
      const type = hasImage ? "figure" : hasTable ? "table" : "notebook-output";
      const outputId = stableId(
        type,
        projectId,
        notebookPath,
        logicalCellKey,
        String(outputIndex),
      );
      addObject({
        id: outputId,
        type,
        title: `${type === "notebook-output" ? "Output" : type[0].toUpperCase() + type.slice(1)} from cell ${cellIndex + 1}`,
        description: excerpt(text),
        payload: {
          kind: type,
          notebookId,
          cellId,
          cellIndex,
          outputIndex,
          outputType: output.output_type,
          mimeTypes: dataMimeTypes,
          contentHash: hash(
            output.output_type,
            text,
            JSON.stringify(dataEntries),
          ),
          executionCount: outputExecutionCount,
          error:
            output.output_type === "error"
              ? {
                  name:
                    typeof output.ename === "string"
                      ? output.ename.slice(0, 200)
                      : null,
                  value:
                    typeof output.evalue === "string"
                      ? output.evalue.slice(0, 2_000)
                      : null,
                  tracebackLineCount: Array.isArray(output.traceback)
                    ? output.traceback.length
                    : 0,
                  tracebackHash: Array.isArray(output.traceback)
                    ? hash(
                        output.traceback
                          .filter((line) => typeof line === "string")
                          .join("\n"),
                      )
                    : null,
                }
              : null,
          untrusted: true,
          scannerVersion: NOTEBOOK_SCANNER_VERSION,
        },
      });
      addRelationship(cellId, outputId, "produces", evidence);
      if (output.output_type === "error") {
        hasExecutionError = true;
        addRisk(
          "execution-error",
          "high",
          `Cell ${cellIndex + 1} contains a stored execution error.`,
          cellIndex,
          source,
          {
            errorName:
              typeof output.ename === "string"
                ? output.ename.slice(0, 200)
                : null,
            outputIndex,
          },
        );
      }
    }

    if (outputs.length > 0 && executionCount === null) {
      addRisk(
        "stale-output",
        "high",
        `Cell ${cellIndex + 1} has outputs but no execution count.`,
        cellIndex,
        source,
      );
    }
    const recordedSourceHash =
      typeof cell.metadata?.cly?.sourceHash === "string"
        ? cell.metadata.cly.sourceHash
        : typeof cell.metadata?.source_hash === "string"
          ? cell.metadata.source_hash
          : null;
    if (
      outputs.length > 0 &&
      recordedSourceHash &&
      recordedSourceHash !== sourceHash
    ) {
      addRisk(
        "stale-output",
        "high",
        `Cell ${cellIndex + 1} outputs were produced from different source text.`,
        cellIndex,
        source,
        { recordedSourceHash, sourceHash },
      );
    }
    for (const match of source.matchAll(ABSOLUTE_PATH_PATTERN)) {
      addRisk(
        "hard-coded-path",
        "medium",
        `Cell ${cellIndex + 1} contains a hard-coded local path.`,
        cellIndex,
        source,
        { pathHash: hash(match[1]) },
      );
    }
  }

  addObject({
    id: notebookId,
    type: "notebook",
    title:
      typeof document.metadata?.title === "string" &&
      document.metadata.title.trim()
        ? document.metadata.title.trim().slice(0, 500)
        : notebookPath.split("/").at(-1),
    description: "Statically imported Jupyter notebook.",
    payload: {
      kind: "notebook",
      path: notebookPath,
      contentHash,
      nbformat: document.nbformat,
      nbformatMinor: Number.isInteger(document.nbformat_minor)
        ? document.nbformat_minor
        : null,
      cellCount: cellRecords.length,
      codeCellCount: cellRecords.filter((cell) => cell.cellType === "code")
        .length,
      executedCellCount: executionCounts.length,
      kernelspec:
        typeof document.metadata?.kernelspec?.name === "string"
          ? document.metadata.kernelspec.name.slice(0, 200)
          : null,
      language:
        typeof document.metadata?.language_info?.name === "string"
          ? document.metadata.language_info.name.slice(0, 100)
          : null,
      untrusted: true,
      executedByImporter: false,
      scannerVersion: NOTEBOOK_SCANNER_VERSION,
    },
  });

  const allCode = codeSources.join("\n");
  if (RANDOM_USE_PATTERN.test(allCode) && !RANDOM_SEED_PATTERN.test(allCode)) {
    const record = cellRecords.find(
      (cell) =>
        cell.cellType === "code" && RANDOM_USE_PATTERN.test(cell.source),
    );
    addRisk(
      "unseeded-randomness",
      "high",
      "Notebook uses randomness without a detectable seed.",
      record?.index ?? null,
      record?.source ?? "",
    );
  }

  let previousExecutionCount = null;
  for (const { cellIndex, executionCount } of executionCounts) {
    if (
      previousExecutionCount !== null &&
      executionCount <= previousExecutionCount
    ) {
      const cell = cellRecords[cellIndex];
      addRisk(
        "out-of-order-execution",
        "high",
        `Cell ${cellIndex + 1} was executed out of notebook order.`,
        cellIndex,
        cell.source,
        { executionCount, previousExecutionCount },
      );
    }
    previousExecutionCount = executionCount;
  }
  if (
    executionCounts.length > 0 &&
    (executionCounts[0].executionCount !== 1 ||
      Math.max(...executionCounts.map((item) => item.executionCount)) >
        executionCounts.length)
  ) {
    addRisk(
      "hidden-state",
      "high",
      "Execution counts indicate kernel state not represented by notebook cells.",
      executionCounts[0].cellIndex,
      cellRecords[executionCounts[0].cellIndex].source,
      {
        executedCellCount: executionCounts.length,
        firstExecutionCount: executionCounts[0].executionCount,
        maxExecutionCount: Math.max(
          ...executionCounts.map((item) => item.executionCount),
        ),
      },
    );
  }

  const declared = declaredDependencies(document.metadata);
  for (const [moduleName, uses] of [...dependencyCells.entries()].sort()) {
    const dependencyId = stableId(
      "dependency",
      projectId,
      notebookPath,
      moduleName,
    );
    addObject({
      id: dependencyId,
      type: "dependency",
      title: moduleName,
      description: `Imported module ${moduleName}.`,
      payload: {
        kind: "dependency",
        notebookId,
        module: moduleName,
        declared:
          declared.has(moduleName.toLowerCase()) ||
          STANDARD_LIBRARY_MODULES.has(moduleName),
        scannerVersion: NOTEBOOK_SCANNER_VERSION,
      },
    });
    for (const use of uses) {
      addRelationship(use.cellId, dependencyId, "depends-on", use.evidence);
    }
    if (
      !declared.has(moduleName.toLowerCase()) &&
      !STANDARD_LIBRARY_MODULES.has(moduleName)
    ) {
      addRisk(
        "missing-dependency",
        "medium",
        `Imported dependency ${moduleName} is not declared in notebook metadata.`,
        cellRecords.findIndex((cell) => cell.id === uses[0].cellId),
        cellRecords.find((cell) => cell.id === uses[0].cellId)?.source ?? "",
        { module: moduleName },
      );
    }
  }

  for (const [reference, uses] of [...datasetCells.entries()].sort()) {
    const datasetId = stableId("dataset", projectId, notebookPath, reference);
    addObject({
      id: datasetId,
      type: "dataset",
      title: reference.split(/[\\/]/).at(-1) || "Dataset",
      description: "Dataset reference inferred from notebook code.",
      payload: {
        kind: "dataset",
        notebookId,
        reference,
        referenceHash: hash(reference),
        scannerVersion: NOTEBOOK_SCANNER_VERSION,
      },
    });
    for (const use of uses)
      addRelationship(use.cellId, datasetId, "uses", use.evidence);
  }

  for (const [functionName, definitions] of [...methodCells.entries()].sort()) {
    const methodId = stableId("method", projectId, notebookPath, functionName);
    addObject({
      id: methodId,
      type: "method",
      title: functionName,
      description: "Method inferred from a notebook function definition.",
      payload: {
        kind: "method",
        notebookId,
        symbol: functionName,
        scannerVersion: NOTEBOOK_SCANNER_VERSION,
      },
    });
    for (const definition of definitions) {
      addRelationship(
        definition.cellId,
        methodId,
        "implements",
        definition.evidence,
      );
    }
  }

  for (const { cellId, evidence, metric } of metricCells) {
    const metricId = stableId(
      "metric",
      projectId,
      notebookPath,
      cellId,
      metric.name,
    );
    addObject({
      id: metricId,
      type: "metric",
      title: metric.name,
      description:
        "Metric inferred from notebook code; value is not evaluated.",
      payload: {
        kind: "metric",
        notebookId,
        cellId,
        name: metric.name,
        expression: metric.expression,
        evaluatedByImporter: false,
        scannerVersion: NOTEBOOK_SCANNER_VERSION,
      },
    });
    addRelationship(cellId, metricId, "produces", evidence);
  }

  for (const { cellId, cellIndex, evidence } of experimentCells) {
    const experimentId = stableId(
      "experiment",
      projectId,
      notebookPath,
      cellId,
    );
    addObject({
      id: experimentId,
      type: "experiment",
      title: `Experiment in cell ${cellIndex + 1}`,
      description:
        "Experiment inferred from a model training or evaluation call.",
      payload: {
        kind: "experiment",
        notebookId,
        cellId,
        inferred: true,
      },
    });
    addRelationship(cellId, experimentId, "implements", evidence);
  }

  const objectiveObjects = objectives.map(({ value, evidence }) => {
    const id = stableId("objective", projectId, notebookPath, value);
    addObject({
      id,
      type: "objective",
      title: value.slice(0, 500),
      description: "Objective explicitly labeled in notebook Markdown.",
      payload: {
        kind: "objective",
        notebookId,
        text: value,
        scannerVersion: NOTEBOOK_SCANNER_VERSION,
      },
    });
    addRelationship(notebookId, id, "tests", evidence);
    return { id, evidence };
  });

  const claimObjects = claims.map(({ value, evidence }) => {
    const id = stableId("claim", projectId, notebookPath, value);
    addObject({
      id,
      type: "claim",
      title: value.slice(0, 500),
      description:
        "Claim explicitly labeled in notebook Markdown; not verified by import.",
      payload: {
        kind: "claim",
        status: "draft",
        reviewStatus: "Needs review",
        inferredFrom: { notebookId },
      },
    });
    addRelationship(notebookId, id, "documents", evidence);
    return { id, evidence };
  });

  if (executionCounts.length > 0) {
    const runId = stableId("run", projectId, notebookPath, "stored-execution");
    addObject({
      id: runId,
      type: "run",
      title: `Stored execution for ${notebookPath.split("/").at(-1)}`,
      description:
        "Run inferred from stored execution counts; the importer did not execute it.",
      payload: {
        kind: "run",
        status: hasExecutionError ? "failed" : "completed",
        notebookId,
        importedStatic: true,
        executedByImporter: false,
        executionCounts: executionCounts.map((item) => item.executionCount),
      },
    });
    addRelationship(
      runId,
      notebookId,
      "generated-by",
      evidenceForCell(notebookPath, 0, "", "notebook/execution-counts"),
    );
    for (const objective of objectiveObjects) {
      addRelationship(runId, objective.id, "tests", objective.evidence);
    }
    for (const claim of claimObjects) {
      for (const result of objects.filter((object) =>
        ["metric", "figure", "table"].includes(object.type),
      )) {
        addRelationship(result.id, claim.id, "supports", claim.evidence);
      }
    }
  }

  const uniqueObjects = [
    ...new Map(objects.map((object) => [object.id, object])).values(),
  ];
  const uniqueRelationships = [
    ...new Map(
      relationships.map((relationship) => [relationship.id, relationship]),
    ).values(),
  ];
  if (
    uniqueObjects.length > MAX_GRAPH_OBJECTS ||
    uniqueRelationships.length > MAX_GRAPH_RELATIONSHIPS
  ) {
    throw new Error("Notebook exceeds the static research graph scan limit.");
  }
  return {
    scannerVersion: NOTEBOOK_SCANNER_VERSION,
    projectId,
    notebookPath,
    notebookId,
    contentHash,
    objects: uniqueObjects,
    relationships: uniqueRelationships,
    summary: {
      objectCount: uniqueObjects.length,
      relationshipCount: uniqueRelationships.length,
      riskCount: risks.length,
      risks: risks.map(({ id, message, rule, severity }) => ({
        id,
        message,
        rule,
        severity,
      })),
      executedCells: false,
    },
  };
}
