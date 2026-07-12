import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  DisclosureRow,
  ProgressIndicator,
  SearchField,
  SplitPane,
  StatusIndicator,
  VirtualizedList,
  WorkspaceHeader,
} from "./design-system";
import { Dialog } from "./primitives";

describe("Cly design system V2", () => {
  it("renders a compact workspace header and non-color status text", () => {
    render(
      <>
        <WorkspaceHeader
          eyebrow="Research"
          title="Claims"
          description="Review evidence"
          metadata={<span>12 objects</span>}
          actions={<button type="button">New claim</button>}
        />
        <StatusIndicator tone="warning">Needs review</StatusIndicator>
      </>,
    );

    expect(screen.getByRole("heading", { name: "Claims" })).toBeVisible();
    expect(screen.getByText("12 objects")).toBeVisible();
    expect(screen.getByText("Needs review")).toHaveAttribute(
      "data-tone",
      "warning",
    );
  });

  it("exposes accessible progress, disclosure, and search controls", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <>
        <ProgressIndicator value={135} label="Context budget" />
        <DisclosureRow title="Evidence" detail="3 linked">
          <p>Evidence details</p>
        </DisclosureRow>
        <SearchField value="" onChange={onChange} label="Search sources" />
      </>,
    );

    expect(
      screen.getByRole("progressbar", { name: "Context budget" }),
    ).toHaveAttribute("aria-valuenow", "100");
    await user.click(screen.getByText("Evidence"));
    expect(screen.getByText("Evidence details")).toBeVisible();
    await user.type(
      screen.getByRole("textbox", { name: "Search sources" }),
      "bayes",
    );
    expect(onChange).toHaveBeenCalled();
  });

  it("resizes split panes from the keyboard", () => {
    render(
      <SplitPane
        primary={<div>List</div>}
        secondary={<div>Detail</div>}
        secondaryWidth={36}
      />,
    );
    const separator = screen.getByRole("separator", { name: "Resize panes" });
    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(separator).toHaveAttribute("aria-valuenow", "38");
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(separator).toHaveAttribute("aria-valuenow", "36");
  });

  it("renders only the visible virtual-list window and advances on scroll", () => {
    const items = Array.from({ length: 500 }, (_, index) => ({
      id: `item-${index}`,
      label: `Recommendation ${index + 1}`,
    }));
    render(
      <VirtualizedList
        items={items}
        height={200}
        rowHeight={40}
        overscan={0}
        label="Recommendations"
        getKey={(item) => item.id}
        renderItem={(item) => item.label}
      />,
    );
    const list = screen.getByRole("list", { name: "Recommendations" });
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("Recommendation 1")).toBeVisible();

    fireEvent.scroll(list, { target: { scrollTop: 400 } });
    expect(screen.getByText("Recommendation 11")).toBeVisible();
    expect(screen.queryByText("Recommendation 1")).not.toBeInTheDocument();
  });

  it("traps dialog focus and closes with Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog
        open
        title="Import source"
        onClose={onClose}
        footer={<button type="button">Import</button>}
      >
        <input aria-label="Source title" />
      </Dialog>,
    );

    expect(screen.getByLabelText("Source title")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
