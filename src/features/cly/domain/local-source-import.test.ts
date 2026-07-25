import { describe, expect, it } from "vitest";
import {
  readSelectedSourceFiles,
  SOURCE_IMPORT_LIMITS,
} from "./local-source-import";

describe("local source import boundary", () => {
  it("treats picker cancellation as a no-op", async () => {
    await expect(readSelectedSourceFiles([])).resolves.toEqual({
      entries: [],
      failures: [],
    });
  });

  it("accepts BibTeX and metadata JSON while reporting partial failures", async () => {
    const result = await readSelectedSourceFiles([
      new File(["@article{safe, title={Safe import}}"], "paper.bib"),
      new File(
        [JSON.stringify({ title: "Metadata import", year: 2026 })],
        "paper.json",
      ),
      new File(["not a source"], "notes.txt"),
      new File(["{"], "broken.json"),
    ]);

    expect(result.entries).toEqual([
      expect.objectContaining({ fileName: "paper.bib", format: "bibtex" }),
      expect.objectContaining({
        fileName: "paper.json",
        format: "metadata",
        records: [{ title: "Metadata import", year: 2026 }],
      }),
    ]);
    expect(result.failures).toEqual([
      expect.objectContaining({ fileName: "notes.txt" }),
      expect.objectContaining({ fileName: "broken.json" }),
    ]);
  });

  it("enforces file-count, per-file, and total-size limits before import", async () => {
    const tooMany = Array.from(
      { length: SOURCE_IMPORT_LIMITS.maxFiles + 1 },
      (_, index) => new File(["{}"], `${index}.json`),
    );
    await expect(readSelectedSourceFiles(tooMany)).rejects.toThrow(
      "Select at most 100 files",
    );

    const oversized = new File(
      ["x".repeat(SOURCE_IMPORT_LIMITS.maxFileBytes + 1)],
      "large.bib",
    );
    const result = await readSelectedSourceFiles([oversized]);
    expect(result.failures[0]?.reason).toContain("1 MB limit");
  });
});
