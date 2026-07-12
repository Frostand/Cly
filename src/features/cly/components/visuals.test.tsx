import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  EvidenceStrength,
  ExecutionStrip,
  ImpactEffortMap,
  ResearchLifecycle,
  RiskDistribution,
  Sparkline,
  TokenBudgetBar,
} from "./visuals";

describe("Cly visual components", () => {
  it("exposes sparkline values as an accessible summary", () => {
    render(<Sparkline values={[4, 7, 6, 9]} label="Run accuracy" />);
    expect(
      screen.getByRole("img", { name: /Run accuracy: 4, 7, 6, 9/ }),
    ).toBeVisible();
  });

  it("marks the current research lifecycle step", () => {
    render(
      <ResearchLifecycle
        steps={["Question", "Sources", "Evidence"]}
        current={1}
      />,
    );
    expect(screen.getByText("Sources").closest("li")).toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  it("summarizes token segments and remaining capacity", () => {
    render(
      <TokenBudgetBar
        capacity={1000}
        segments={[
          { label: "Sources", value: 250 },
          { label: "Claims", value: 150 },
        ]}
      />,
    );
    expect(screen.getByLabelText(/400 of 1000 tokens/)).toBeVisible();
    expect(screen.getByText("600 remaining")).toBeVisible();
  });

  it("keeps evidence, execution, and risk visuals understandable without color", () => {
    render(
      <>
        <EvidenceStrength confidence={72} support={3} contradictions={1} />
        <ExecutionStrip cells={["markdown", "code", "output", "error"]} />
        <RiskDistribution
          values={[
            { label: "Blocking", value: 1, tone: "danger" },
            { label: "Passed", value: 3, tone: "success" },
          ]}
        />
      </>,
    );
    expect(
      screen.getByLabelText(/72% confidence, 3 supporting, 1 contradicting/),
    ).toBeVisible();
    expect(
      screen.getByRole("img", {
        name: /1 markdown, 1 code, 1 output, 1 error/,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("img", { name: /Blocking: 1, Passed: 3/ }),
    ).toBeVisible();
  });

  it("summarizes impact and effort without relying on dot position", () => {
    render(
      <ImpactEffortMap
        items={[
          {
            id: "step-1",
            label: "Run baseline",
            impact: "High",
            effort: "Medium",
            status: "Recommended",
          },
        ]}
      />,
    );
    expect(
      screen.getByRole("img", {
        name: /Run baseline: High impact, Medium effort, Recommended/,
      }),
    ).toBeVisible();
  });
});
