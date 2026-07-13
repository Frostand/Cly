export const AWS_CUR_SCHEMA_VERSION = "aws-cur.v1";

export const AWS_CUR_REQUIRED_COLUMNS = [
  "identity/LineItemId",
  "resourceTags/user:cly-run-id",
  "lineItem/UsageStartDate",
  "lineItem/UsageEndDate",
  "lineItem/UnblendedCost",
  "lineItem/CurrencyCode",
  "lineItem/ProductCode",
  "lineItem/UsageType",
  "lineItem/ResourceId",
];

const CURRENCY_EXPONENTS = new Map([
  ["BHD", 3],
  ["CLF", 4],
  ["IQD", 3],
  ["JPY", 0],
  ["JOD", 3],
  ["KRW", 0],
  ["KWD", 3],
  ["LYD", 3],
  ["OMR", 3],
  ["TND", 3],
]);

function currencyExponent(currency) {
  return CURRENCY_EXPONENTS.get(currency) ?? 2;
}

/** Convert a provider decimal string to integer minor units without floats. */
export function decimalMoneyToMinor(value, currency) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new Error(`Invalid decimal money value: ${value}`);
  const exponent = currencyExponent(currency);
  const scale = 10n ** BigInt(exponent);
  const whole = BigInt(match[2]);
  const fraction = match[3] ?? "";
  const kept = fraction.slice(0, exponent).padEnd(exponent, "0");
  let minor = whole * scale + BigInt(kept || "0");
  const discarded = fraction.slice(exponent);
  if (discarded && discarded[0] >= "5") minor += 1n;
  if (match[1] === "-") minor *= -1n;
  const result = Number(minor);
  if (!Number.isSafeInteger(result)) {
    throw new Error("Cost exceeds the supported integer minor-unit range.");
  }
  return result;
}

function parseCsvRows(csv) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("AWS CUR CSV contains an unclosed quote.");
  row.push(field.replace(/\r$/, ""));
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function categoryForRow(row) {
  const product = row["lineItem/ProductCode"].toLowerCase();
  const usage = row["lineItem/UsageType"].toLowerCase();
  if (product.includes("bedrock")) return "model-api";
  if (product.includes("s3") || usage.includes("storage")) return "storage";
  if (
    product.includes("ec2") &&
    /(?:^|[^a-z0-9])(?:gpu|p[2345][a-z]*|g[3456][a-z]*|inf[12])(?:[.-]|$)/i.test(
      usage,
    )
  ) {
    return "gpu";
  }
  return "cloud";
}

function requireValue(row, column, rowNumber) {
  const value = row[column]?.trim();
  if (!value) throw new Error(`AWS CUR row ${rowNumber} is missing ${column}.`);
  return value;
}

function requireIsoDate(value, column, rowNumber) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) {
    throw new Error(`AWS CUR row ${rowNumber} has an invalid ${column}.`);
  }
  return value;
}

export function parseAwsCurCsv(csv, fileName = "aws-cur.csv") {
  const rows = parseCsvRows(csv);
  if (rows.length < 2) throw new Error("AWS CUR CSV has no cost rows.");
  const headers = rows[0].map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, "").trim() : header.trim(),
  );
  const missing = AWS_CUR_REQUIRED_COLUMNS.filter(
    (column) => !headers.includes(column),
  );
  if (missing.length) {
    throw new Error(`AWS CUR CSV is missing columns: ${missing.join(", ")}.`);
  }

  return rows.slice(1).map((values, index) => {
    const rowNumber = index + 2;
    if (values.length !== headers.length) {
      throw new Error(
        `AWS CUR row ${rowNumber} has ${values.length} columns; expected ${headers.length}.`,
      );
    }
    const row = Object.fromEntries(
      headers.map((header, headerIndex) => [header, values[headerIndex]]),
    );
    const currency = requireValue(
      row,
      "lineItem/CurrencyCode",
      rowNumber,
    ).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new Error(`AWS CUR row ${rowNumber} has an invalid currency.`);
    }
    const product = requireValue(row, "lineItem/ProductCode", rowNumber);
    const usageType = requireValue(row, "lineItem/UsageType", rowNumber);
    const resourceId = requireValue(row, "lineItem/ResourceId", rowNumber);
    return {
      amountMinor: decimalMoneyToMinor(
        requireValue(row, "lineItem/UnblendedCost", rowNumber),
        currency,
      ),
      category: categoryForRow(row),
      confidenceBps: 9500,
      currency,
      description: `${product} · ${usageType} · ${resourceId}`,
      endedAt: requireIsoDate(
        requireValue(row, "lineItem/UsageEndDate", rowNumber),
        "lineItem/UsageEndDate",
        rowNumber,
      ),
      providerEntryId: requireValue(row, "identity/LineItemId", rowNumber),
      raw: {
        fileName,
        provider: "AWS Cost and Usage Report",
        row,
        rowNumber,
        schema: AWS_CUR_SCHEMA_VERSION,
      },
      runId: requireValue(row, "resourceTags/user:cly-run-id", rowNumber),
      source: "aws-cur",
      startedAt: requireIsoDate(
        requireValue(row, "lineItem/UsageStartDate", rowNumber),
        "lineItem/UsageStartDate",
        rowNumber,
      ),
    };
  });
}
