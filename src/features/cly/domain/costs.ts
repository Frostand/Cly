import type {
  CostCategory,
  CostWasteClassification,
  MoneyTotal,
} from "./types";

const currencyExponents: Record<string, number> = {
  BHD: 3,
  CLF: 4,
  IQD: 3,
  JPY: 0,
  JOD: 3,
  KRW: 0,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
};

export const costCategoryLabels: Record<CostCategory, string> = {
  gpu: "GPU",
  cloud: "Cloud",
  storage: "Storage",
  "model-api": "Model API",
  agent: "Agent",
  rerun: "Rerun",
  other: "Other",
};

export const costWasteLabels: Record<CostWasteClassification, string> = {
  failed: "Failed",
  duplicated: "Duplicated",
  abandoned: "Abandoned",
  unused: "Unused",
  repeated: "Repeated",
  "stale-rerun": "Stale rerun",
};

const exponentFor = (currency: string) => currencyExponents[currency] ?? 2;

export function parseMajorMoneyToMinor(value: string, currency: string) {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new Error("Enter a positive decimal amount.");
  const exponent = exponentFor(currency);
  const fraction = match[2] ?? "";
  if (fraction.length > exponent) {
    throw new Error(`${currency} supports ${exponent} decimal places.`);
  }
  const scale = BigInt(10) ** BigInt(exponent);
  const minor =
    BigInt(match[1]) * scale + BigInt(fraction.padEnd(exponent, "0") || "0");
  const result = Number(minor);
  if (!Number.isSafeInteger(result)) {
    throw new Error("Amount exceeds the supported minor-unit range.");
  }
  return result;
}

export function formatMoney({ amountMinor, currency }: MoneyTotal) {
  const exponent = exponentFor(currency);
  const scale = BigInt(10) ** BigInt(exponent);
  const signed = BigInt(amountMinor);
  const absolute = signed < BigInt(0) ? -signed : signed;
  const whole = absolute / scale;
  const fraction = (absolute % scale).toString().padStart(exponent, "0");
  return `${signed < BigInt(0) ? "−" : ""}${currency} ${whole.toLocaleString("en-US")}${
    exponent ? `.${fraction}` : ""
  }`;
}

export function formatMoneyTotals(totals: MoneyTotal[]) {
  return totals.length ? totals.map(formatMoney).join(" · ") : "—";
}
