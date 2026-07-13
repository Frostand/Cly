# AWS CUR cost import

Cly supports a versioned subset of the AWS Cost and Usage Report CSV format for
project-scoped run-cost attribution. The importer schema is `aws-cur.v1`.

## Required columns

The CSV must contain these exact headers:

| Header | Use |
| --- | --- |
| `identity/LineItemId` | Stable provider identifier used for idempotent import |
| `resourceTags/user:cly-run-id` | Existing Cly run ID in the active project |
| `lineItem/UsageStartDate` | ISO 8601 usage start |
| `lineItem/UsageEndDate` | ISO 8601 usage end |
| `lineItem/UnblendedCost` | Decimal cost in the row currency |
| `lineItem/CurrencyCode` | ISO-style three-letter currency code |
| `lineItem/ProductCode` | AWS product used for categorization and description |
| `lineItem/UsageType` | AWS usage type used for categorization and description |
| `lineItem/ResourceId` | Provider resource identifier retained in raw traceability |

Example:

```csv
identity/LineItemId,resourceTags/user:cly-run-id,lineItem/UsageStartDate,lineItem/UsageEndDate,lineItem/UnblendedCost,lineItem/CurrencyCode,lineItem/ProductCode,lineItem/UsageType,lineItem/ResourceId
li-2026-07-run-02,run-02,2026-07-07T12:02:00Z,2026-07-07T13:02:00Z,18.42,USD,AmazonEC2,BoxUsage:p5.48xlarge,i-0123456789abcdef0
```

## Import behavior

- The tag `resourceTags/user:cly-run-id` must identify a run in the active Cly
  project. Cross-project or unknown run IDs reject the import.
- Deduplication is stable and project-scoped. Cly derives the key
  `aws-cur:<identity/LineItemId>` and skips an existing key on reimport.
- Costs are parsed from decimal strings and stored as integer minor units. Cly
  never uses floating-point currency arithmetic. Provider values below the
  currency's minor unit are rounded half up.
- Currency is retained on every row. Different currencies are aggregated and
  displayed separately; Cly does not perform implicit conversion.
- Imported rows use 95% attribution confidence. The original CSV row, source
  filename, row number, resource ID, and schema version are retained as raw
  traceability.
- `AmazonBedrock` maps to **Model API**, `AmazonS3` and storage usage map to
  **Storage**, recognized EC2 GPU usage maps to **GPU**, and other rows map to
  **Cloud**.

AWS may emit additional CUR columns. They are accepted and retained in the raw
row, but they do not change the `aws-cur.v1` attribution rules.
