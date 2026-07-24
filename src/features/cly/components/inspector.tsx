import {
  ExternalLink,
  Link2,
  PanelRightClose,
  Pin,
  Sparkles,
} from "lucide-react";
import type { InheritedRestriction } from "../domain/obligations";
import { capabilityUnavailableMessage } from "../services/capabilities";
import { isClyDemoRuntime } from "../services/runtime";
import { useClyStore } from "../store/cly-store";
import { InheritedRestrictions } from "./inherited-restrictions";
import { screenLabels } from "./navigation";
import { Badge, Button, toneForStatus } from "./primitives";

const noRestrictions: InheritedRestriction[] = [];

const pretty = (value: unknown): string => {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number")
    return value <= 1 ? `${Math.round(value * 100)}%` : String(value);
  if (value && typeof value === "object")
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}: ${String(item)}`)
      .join(" · ");
  return String(value ?? "Not set");
};

const inspectorFields: Record<string, string[]> = {
  claim: [
    "type",
    "status",
    "confidence",
    "supportingSourceIds",
    "contradictingSourceIds",
    "experimentIds",
    "assumptions",
    "weaknesses",
    "reviewerRisks",
    "nextExperiment",
  ],
  source: [
    "authors",
    "year",
    "type",
    "status",
    "relevance",
    "confidence",
    "summary",
    "provider",
    "providerId",
    "url",
    "doi",
    "provenance",
    "methods",
    "findings",
    "limitations",
    "linkedClaimIds",
    "path",
  ],
  experiment: [
    "type",
    "status",
    "goal",
    "hypothesis",
    "command",
    "environment",
    "dataset",
    "claimIds",
    "limitations",
    "nextStep",
  ],
  run: [
    "status",
    "experimentId",
    "startedAt",
    "duration",
    "environment",
    "codeVersion",
    "metrics",
    "config",
    "reproducibility",
    "canonical",
  ],
  notebook: [
    "path",
    "status",
    "executionConsistency",
    "reproducibility",
    "codeCells",
    "outputs",
    "figures",
    "issues",
    "imports",
    "claimIds",
  ],
  code: [
    "path",
    "status",
    "purpose",
    "objective",
    "method",
    "tests",
    "risks",
    "confidence",
    "claimIds",
    "experimentIds",
  ],
  artifact: [
    "kind",
    "path",
    "sourceData",
    "generator",
    "experimentId",
    "runId",
    "commit",
    "regeneration",
    "hash",
    "claimIds",
  ],
  finding: [
    "category",
    "severity",
    "status",
    "detail",
    "assignee",
    "objectIds",
  ],
  integration: [
    "category",
    "status",
    "purpose",
    "capabilities",
    "privacy",
    "lastSync",
  ],
  step: [
    "category",
    "status",
    "rationale",
    "impact",
    "effort",
    "urgency",
    "agentPreset",
    "contextPack",
    "evidenceIds",
  ],
  decision: [
    "date",
    "status",
    "decision",
    "reason",
    "alternatives",
    "evidenceIds",
    "affectedIds",
    "outcome",
    "supersededBy",
    "origin",
  ],
  context: [
    "category",
    "type",
    "tokens",
    "freshness",
    "representation",
    "included",
    "pinned",
    "confidence",
    "source",
    "linkedIds",
  ],
  session: [
    "preset",
    "status",
    "progress",
    "startedAt",
    "currentTask",
    "outputs",
  ],
  graph: ["type", "status", "id"],
};

function findEntity() {
  const { data, selectedId } = useClyStore.getState();
  if (!selectedId) return null;
  const candidates = [
    ["claim", data.claims],
    ["source", data.sources],
    ["experiment", data.experiments],
    ["run", data.runs],
    ["notebook", data.notebooks],
    ["code", data.code],
    ["artifact", data.artifacts],
    ["finding", data.findings],
    ["integration", data.integrations],
    ["step", data.nextSteps],
    ["decision", data.decisions],
    ["context", data.contextItems],
    ["session", data.agentSessions],
    ["graph", data.graphNodes],
  ] as const;
  for (const [kind, items] of candidates) {
    const entity = (items as readonly { id: string }[]).find(
      (item) => item.id === selectedId,
    );
    if (entity)
      return {
        kind,
        entity: entity as Record<string, unknown> & { id: string },
      };
  }
  return null;
}

const titleFor = (entity: Record<string, unknown>) =>
  String(
    entity.title ?? entity.name ?? entity.text ?? entity.label ?? entity.id,
  );

export function Inspector() {
  const activeScreen = useClyStore((s) => s.activeScreen);
  const selectedId = useClyStore((s) => s.selectedId);
  const toggle = useClyStore((s) => s.toggleInspector);
  const notify = useClyStore((s) => s.notify);
  const restrictions = useClyStore((s) =>
    selectedId
      ? (s.inheritedRestrictions[selectedId] ?? noRestrictions)
      : noRestrictions,
  );
  const setScreen = useClyStore((s) => s.setScreen);
  const selection = selectedId ? findEntity() : null;

  return (
    <aside
      className="cly-inspector"
      aria-label="Contextual inspector"
      data-testid="inspector"
    >
      <div className="cly-inspector-inner">
        <div className="cly-inspector-header">
          <strong className="cly-small">Inspector</strong>
          <Button
            variant="ghost"
            iconOnly
            aria-label="Close inspector"
            onClick={() => {
              toggle();
              document.getElementById("main-workspace")?.focus();
            }}
          >
            <PanelRightClose size={14} />
          </Button>
        </div>
        <div className="cly-inspector-content">
          {selection ? (
            <>
              <div className="cly-page-kicker">{selection.kind}</div>
              <h2 className="cly-inspector-title">
                {titleFor(selection.entity)}
              </h2>
              {selection.entity.status ? (
                <Badge tone={toneForStatus(String(selection.entity.status))}>
                  {String(selection.entity.status)}
                </Badge>
              ) : null}
              <InheritedRestrictions
                restrictions={restrictions}
                compact
                onOpen={() => setScreen("obligations")}
              />
              <div className="cly-inspector-section">
                <div className="cly-inspector-label">Details</div>
                <dl className="cly-detail-grid">
                  {(
                    inspectorFields[selection.kind] ??
                    Object.keys(selection.entity).slice(0, 10)
                  ).map((key) => (
                    <div key={key} style={{ display: "contents" }}>
                      <dt>
                        {key
                          .replace(/([A-Z])/g, " $1")
                          .replace(/^./, (c) => c.toUpperCase())}
                      </dt>
                      <dd>{pretty(selection.entity[key])}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="cly-inspector-section">
                <div className="cly-inspector-label">Research links</div>
                <div className="cly-stack">
                  <Button onClick={() => setScreen("graph")}>
                    <Link2 size={13} /> Trace linked objects
                  </Button>
                  <Button
                    onClick={() => {
                      setScreen("context");
                      notify(
                        "Context composer opened",
                        "Choose an approved durable revision or create one from the context workspace.",
                      );
                    }}
                  >
                    <Pin size={13} /> Open in context
                  </Button>
                  <Button
                    disabled={!isClyDemoRuntime}
                    title={capabilityUnavailableMessage("agents.execute")}
                    onClick={() =>
                      notify(
                        "Agent action preview",
                        "This action is simulated; no external model call was made.",
                      )
                    }
                  >
                    <Sparkles size={13} /> Ask agent about this
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={!isClyDemoRuntime}
                    title={capabilityUnavailableMessage(
                      "integrations.configure",
                    )}
                    onClick={() =>
                      notify(
                        "External open unavailable",
                        "The UI prototype keeps external file/editor actions behind an explicit service boundary.",
                      )
                    }
                  >
                    <ExternalLink size={13} /> Open original
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="cly-page-kicker">
                {screenLabels[activeScreen]}
              </div>
              <h2 className="cly-inspector-title">Nothing selected</h2>
              <p className="cly-muted cly-small" style={{ lineHeight: 1.55 }}>
                Select a row, graph node, claim, source, run, or finding to
                inspect its metadata and research links here.
              </p>
              <div className="cly-inspector-section">
                <div className="cly-inspector-label">Inspector behavior</div>
                <p className="cly-muted cly-small" style={{ lineHeight: 1.55 }}>
                  The panel follows selection across every workspace so dense
                  lists can stay focused on comparison.
                </p>
              </div>
              <div className="cly-inspector-section">
                <div className="cly-inspector-label">Keyboard</div>
                <div className="cly-row-between">
                  <span className="cly-muted cly-small">Toggle inspector</span>
                  <kbd className="cly-kbd">⌘⌥I</kbd>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
