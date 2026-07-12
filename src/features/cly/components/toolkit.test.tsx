import type { ColumnDef } from "@tanstack/react-table";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClyDataTable } from "./toolkit";

type RecordRow = { id: string; name: string; score: number };
const rows: RecordRow[] = [
  { id: "b", name: "Beta", score: 20 },
  { id: "a", name: "Alpha", score: 10 },
];
const columns: ColumnDef<RecordRow, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "score", header: "Score" },
];

describe("Cly toolkit", () => {
  it("sorts TanStack table rows and exposes sorting semantics", () => {
    render(
      <ClyDataTable
        id="test-records"
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Name/ }));
    expect(screen.getByRole("columnheader", { name: /Name/ })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    const renderedRows = screen.getAllByRole("row").slice(1);
    expect(within(renderedRows[0]).getByText("Alpha")).toBeVisible();
  });

  it("selects a table row with the keyboard", () => {
    const onSelect = vi.fn();
    render(
      <ClyDataTable
        id="keyboard-records"
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        onSelect={onSelect}
      />,
    );
    fireEvent.keyDown(screen.getAllByRole("row")[1], { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(rows[0]);
  });
});
