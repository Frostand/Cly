import { describe, expect, it } from "vitest";

import {
  AWS_CUR_REQUIRED_COLUMNS,
  decimalMoneyToMinor,
  parseAwsCurCsv,
} from "./aws-cur.js";

const csv = (values: string[]) =>
  `${AWS_CUR_REQUIRED_COLUMNS.join(",")}\n${values.join(",")}\n`;

describe("AWS CUR cost import", () => {
  it("converts provider decimal strings to minor units without floating point", () => {
    expect(decimalMoneyToMinor("12.345", "USD")).toBe(1235);
    expect(decimalMoneyToMinor("0.004", "USD")).toBe(0);
    expect(decimalMoneyToMinor("-1.005", "USD")).toBe(-101);
    expect(decimalMoneyToMinor("120", "JPY")).toBe(120);
    expect(decimalMoneyToMinor("1.2345", "KWD")).toBe(1235);
  });

  it("parses the documented columns, quoted values, and GPU category", () => {
    const [entry] = parseAwsCurCsv(
      csv([
        "line-1",
        "run-1",
        "2026-07-01T00:00:00Z",
        "2026-07-01T01:00:00Z",
        "1.255",
        "usd",
        "AmazonEC2",
        '"USE1-BoxUsage:p4d.24xlarge"',
        '"i-1,primary"',
      ]),
      "july.csv",
    );

    expect(entry).toMatchObject({
      amountMinor: 126,
      category: "gpu",
      currency: "USD",
      providerEntryId: "line-1",
      runId: "run-1",
      source: "aws-cur",
    });
    expect(entry.raw).toMatchObject({
      fileName: "july.csv",
      rowNumber: 2,
      schema: "aws-cur.v1",
    });
  });

  it("rejects missing columns and malformed rows with the row number", () => {
    expect(() => parseAwsCurCsv("a,b\n1,2\n")).toThrow("missing columns");
    expect(() =>
      parseAwsCurCsv(
        csv([
          "line-1",
          "run-1",
          "not-a-time",
          "2026-07-01T01:00:00Z",
          "1.00",
          "USD",
          "AmazonS3",
          "TimedStorage-ByteHrs",
          "bucket-1",
        ]),
      ),
    ).toThrow("row 2");
  });
});
