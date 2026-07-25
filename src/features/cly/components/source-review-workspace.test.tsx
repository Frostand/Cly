import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Source } from "../domain/types";
import { createFixtureRepository } from "../fixtures/repository";
import {
  LiteratureMatrixWorkspace,
  SourceReviewInspector,
} from "./source-review-workspace";

describe("source review workspaces", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  it("opens source passages and records an explicit human verification action", async () => {
    const source = createFixtureRepository("active").sources[0];
    const onVerificationChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SourceReviewInspector
        source={source}
        onVerificationChange={onVerificationChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Principal result/ }));
    expect(
      screen.getByText(/undetected rollout failures by 41%/),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Verify passage" }));
    expect(onVerificationChange).toHaveBeenCalledWith(
      "principalResult",
      "verified",
    );
  });

  it("supports evidence drill-in, contradictory evidence, custom columns, grouping, compare, and export", async () => {
    const sources = createFixtureRepository("active").sources;
    const claims = createFixtureRepository("active").claims;
    const notify = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const createObjectURL = vi.fn(() => "blob:matrix");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const user = userEvent.setup();
    render(
      <LiteratureMatrixWorkspace
        sources={sources}
        claims={claims}
        onSelectSource={vi.fn()}
        notify={notify}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: /Open Research problem evidence for Reliable neural surrogates/,
      }),
    );
    const evidenceDialog = screen.getByRole("dialog", {
      name: "Research problem evidence",
    });
    expect(
      within(evidenceDialog).getByText(/temporal, parameter, and compound/),
    ).toBeVisible();
    expect(
      within(evidenceDialog).getByText(/nominal coverage fell below/),
    ).toBeVisible();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Add column" }));
    await user.type(screen.getByLabelText("Column name"), "Population");
    await user.click(screen.getByRole("button", { name: "Add column" }));
    expect(
      screen.getByRole("columnheader", { name: /Population/ }),
    ).toBeVisible();

    await user.selectOptions(
      screen.getByLabelText("Group literature matrix"),
      "Folder",
    );
    expect(
      screen.getByRole("region", { name: "Core evidence sources" }),
    ).toBeVisible();

    await user.click(
      screen.getByRole("checkbox", { name: /Compare Reliable neural/ }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: /Compare Uncertainty under/ }),
    );
    await user.click(screen.getByRole("button", { name: "Compare (2)" }));
    expect(
      screen.queryByText("Cylinder-flow reference trajectories v2"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      "Matrix exported",
      expect.stringContaining("2 source rows"),
    );
  });

  it("renders honest empty, partial, malformed, and unverified states", () => {
    const base = createFixtureRepository("active").sources[0];
    const malformed = {
      ...base,
      id: "malformed",
      title: "Malformed extraction",
      extractedFields: {
        researchProblem: {
          value: 17,
          passage: { quote: "" },
          confidence: 300,
          verificationState: "approved",
        },
      },
    } as unknown as Source;
    const { rerender } = render(
      <LiteratureMatrixWorkspace
        sources={[]}
        claims={[]}
        onSelectSource={vi.fn()}
        notify={vi.fn()}
      />,
    );
    expect(
      screen.getByText("No sources in the literature matrix"),
    ).toBeVisible();
    rerender(
      <LiteratureMatrixWorkspace
        sources={[
          malformed,
          { ...base, id: "partial", extractedFields: undefined },
        ]}
        claims={[]}
        onSelectSource={vi.fn()}
        notify={vi.fn()}
      />,
    );
    expect(screen.getAllByText(/Malformed record/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Missing evidence/).length).toBeGreaterThan(0);
  });
});
