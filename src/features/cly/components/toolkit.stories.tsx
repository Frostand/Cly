import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button, Dialog, EmptyState, LoadingState } from "./primitives";
import { ClySplitPane, ClyTerminal, ClyTooltip } from "./toolkit";
import {
  EvidenceStrength,
  ExecutionStrip,
  ImpactEffortMap,
  ResearchLifecycle,
  RiskDistribution,
  TokenBudgetBar,
  VisualMetric,
} from "./visuals";

const meta = {
  title: "Cly/Toolkit",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const SplitPane: Story = {
  render: () => (
    <div
      style={{ width: 920, height: 480, border: "1px solid var(--cly-border)" }}
    >
      <ClySplitPane
        id="storybook-split"
        primary={<div className="cly-panel-body">Research records</div>}
        secondary={<div className="cly-panel-body">Evidence inspector</div>}
      />
    </div>
  ),
};

export const AccessibleDialog: Story = {
  render: function DialogStory() {
    const [open, setOpen] = useState(true);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open dialog</Button>
        <Dialog
          open={open}
          title="Link evidence"
          description="Choose the research object that supports this claim."
          onClose={() => setOpen(false)}
          footer={<Button variant="primary">Link evidence</Button>}
        >
          <label className="cly-field">
            <span>Research object</span>
            <input className="cly-input" defaultValue="Calibration benchmark" />
          </label>
        </Dialog>
      </>
    );
  },
};

export const TerminalFixture: Story = {
  render: () => (
    <div style={{ width: 760, height: 360 }}>
      <ClyTerminal
        label="Test runner output"
        lines={["$ pnpm test -- --run", "✓ 43 tests passed", "Done in 3.9s"]}
      />
    </div>
  ),
};

export const FeedbackStates: Story = {
  render: () => (
    <div className="cly-grid-2" style={{ width: 900 }}>
      <EmptyState
        title="No linked evidence"
        description="Link a source, run, or notebook."
        action={<Button variant="primary">Link evidence</Button>}
      />
      <LoadingState label="Loading provenance records" />
    </div>
  ),
};

export const Tooltip: Story = {
  render: () => (
    <ClyTooltip label="Open agent activity">
      <Button iconOnly aria-label="Open agent activity">
        A
      </Button>
    </ClyTooltip>
  ),
};

export const VisualSystemV4: Story = {
  render: () => (
    <div className="cly-page" style={{ width: 1100 }}>
      <ResearchLifecycle
        steps={[
          "Question",
          "Sources",
          "Method",
          "Experiment",
          "Evidence",
          "Claim",
        ]}
        current={4}
      />
      <div className="cly-visual-metrics">
        <VisualMetric
          label="Coverage"
          value="93%"
          detail="Comparable runs"
          values={[84, 89, 91, 93]}
          tone="success"
        />
        <VisualMetric
          label="Open findings"
          value="4"
          detail="One blocking"
          values={[9, 7, 5, 4]}
          tone="warning"
        />
      </div>
      <div className="cly-grid-2" style={{ marginTop: 24 }}>
        <div className="cly-stack">
          <TokenBudgetBar
            capacity={128000}
            segments={[
              { label: "Claims", value: 3840 },
              { label: "Notebooks", value: 2460, tone: "info" },
              { label: "Experiments", value: 5120, tone: "success" },
            ]}
          />
          <EvidenceStrength confidence={84} support={2} contradictions={1} />
          <ExecutionStrip
            cells={["markdown", "code", "code", "output", "code", "error"]}
          />
          <RiskDistribution
            values={[
              { label: "Blocking", value: 1, tone: "danger" },
              { label: "High", value: 2, tone: "warning" },
              { label: "Passed", value: 4, tone: "success" },
            ]}
          />
        </div>
        <ImpactEffortMap
          items={[
            {
              id: "1",
              label: "Run baseline",
              impact: "High",
              effort: "Medium",
              status: "Recommended",
            },
            {
              id: "2",
              label: "Fix figure",
              impact: "High",
              effort: "Small",
              status: "Accepted",
            },
            {
              id: "3",
              label: "Archive loss",
              impact: "Low",
              effort: "Small",
              status: "Deferred",
            },
          ]}
        />
      </div>
    </div>
  ),
};
