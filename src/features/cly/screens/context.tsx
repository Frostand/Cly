import {
  Archive,
  ArrowDown,
  ArrowUp,
  Box,
  Eye,
  GitBranch,
  Pin,
  PinOff,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Panel,
  SearchInput,
  Section,
  Segmented,
  Toggle,
  toneForStatus,
} from "../components/primitives";
import { calculateContextBudget } from "../domain/logic";
import type { ContextItem } from "../domain/types";
import { mockServices } from "../services/mock-services";
import { useClyStore } from "../store/cly-store";

const modelOptions = [
  "GPT-5 · 128k",
  "Claude Sonnet · 200k",
  "Local model · 32k",
] as const;
const capacities = {
  "GPT-5 · 128k": 128000,
  "Claude Sonnet · 200k": 200000,
  "Local model · 32k": 32000,
};

export function ContextScreen() {
  const items = useClyStore((s) => s.data.contextItems);
  const packs = useClyStore((s) => s.data.contextPacks);
  const selectedId = useClyStore((s) => s.selectedId);
  const setSelected = useClyStore((s) => s.setSelected);
  const updateItem = useClyStore((s) => s.updateContextItem);
  const notify = useClyStore((s) => s.notify);
  const [query, setQuery] = useState("");
  const [model, setModel] = useState<(typeof modelOptions)[number]>(
    modelOptions[0],
  );
  const [previewMode, setPreviewMode] = useState<"Composer" | "Agent preview">(
    "Composer",
  );
  const budget = useMemo(
    () => calculateContextBudget(items, capacities[model]),
    [items, model],
  );
  const selected = items
    .filter((item) => item.included)
    .sort((a, b) => a.priority - b.priority);
  const filtered = items.filter(
    (item) =>
      !query ||
      `${item.name} ${item.category} ${item.type}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );

  const applyPack = (itemIds: string[], name: string) => {
    items.forEach((item) => {
      updateItem(item.id, { included: itemIds.includes(item.id) });
    });
    notify(
      "Context pack applied",
      `${name} selected ${itemIds.length} context objects.`,
    );
  };

  const move = (item: ContextItem, direction: -1 | 1) =>
    updateItem(item.id, { priority: Math.max(1, item.priority + direction) });

  return (
    <div className="cly-page cly-page-wide">
      <PageHeader
        kicker="Workspace"
        title="Context Composer"
        description="Control exactly what is selected, summarized, pinned, excluded, and sent to an agent. This does not change a model’s context-window limit."
        actions={
          <>
            <Segmented
              value={previewMode}
              options={["Composer", "Agent preview"] as const}
              onChange={setPreviewMode}
              label="Context view"
            />
            <Button
              variant="primary"
              onClick={() =>
                notify(
                  "Context pack saved",
                  `${selected.length} items · ${budget.tokens.toLocaleString()} estimated tokens`,
                )
              }
            >
              Save pack
            </Button>
          </>
        }
      />
      {items.length === 0 ? (
        <EmptyState
          title="No context objects"
          description="Sources, experiments, claims, notebooks, decisions, and reports become context objects as the project grows."
          action={<Button variant="primary">Add custom note</Button>}
        />
      ) : (
        <div className="cly-context-layout">
          <div>
            {previewMode === "Composer" ? (
              <>
                <div className="cly-filterbar">
                  <SearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder="Filter context objects…"
                  />
                  <span className="cly-muted cly-small">
                    {filtered.length} objects · sorted by priority
                  </span>
                </div>
                <Panel>
                  {filtered.map((item) => (
                    <div
                      className="cly-context-row"
                      key={item.id}
                      data-selected={selectedId === item.id}
                    >
                      <Toggle
                        pressed={item.included}
                        onChange={(included) =>
                          void mockServices.context.setIncluded(
                            item.id,
                            included,
                          )
                        }
                        label={`${item.included ? "Exclude" : "Include"} ${item.name}`}
                      />
                      <button
                        type="button"
                        onClick={() => setSelected(item.id)}
                        style={{
                          minWidth: 0,
                          border: 0,
                          background: "transparent",
                          color: "inherit",
                          textAlign: "left",
                          cursor: "pointer",
                        }}
                      >
                        <div className="cly-list-title">{item.name}</div>
                        <div className="cly-list-detail">
                          {item.category} · {item.source} · {item.confidence}%
                          confidence
                        </div>
                      </button>
                      <button
                        className="cly-btn"
                        type="button"
                        onClick={() =>
                          void mockServices.context.setRepresentation(
                            item.id,
                            item.representation === "Raw" ? "Summary" : "Raw",
                          )
                        }
                        aria-label={`Use ${item.representation === "Raw" ? "summary" : "raw"} representation for ${item.name}`}
                      >
                        {item.representation}
                      </button>
                      <div>
                        <div className="cly-strong cly-small">
                          {item.tokens.toLocaleString()}
                        </div>
                        <div className="cly-faint" style={{ fontSize: 9 }}>
                          tokens
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        iconOnly
                        aria-label={`${item.pinned ? "Unpin" : "Pin"} ${item.name}`}
                        onClick={() =>
                          void mockServices.context.setPinned(
                            item.id,
                            !item.pinned,
                          )
                        }
                      >
                        {item.pinned ? <Pin size={13} /> : <PinOff size={13} />}
                      </Button>
                    </div>
                  ))}
                </Panel>
              </>
            ) : (
              <Panel>
                <div className="cly-panel-header">
                  <div>
                    <strong>Exact agent context preview</strong>
                    <div className="cly-muted cly-small">
                      Ordered content envelope · secrets and excluded items are
                      not shown
                    </div>
                  </div>
                  <Button
                    onClick={() =>
                      notify(
                        "Preview copied",
                        "The context manifest was copied as fixture text.",
                      )
                    }
                  >
                    Copy manifest
                  </Button>
                </div>
                <div className="cly-panel-body cly-stack">
                  {selected.map((item, index) => (
                    <div className="cly-callout" key={item.id}>
                      <div className="cly-row-between">
                        <div className="cly-row">
                          <span className="cly-faint cly-mono">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <strong>{item.name}</strong>
                          <Badge tone={toneForStatus(item.freshness)}>
                            {item.freshness}
                          </Badge>
                        </div>
                        <span className="cly-muted cly-small">
                          {item.representation} · {item.tokens.toLocaleString()}{" "}
                          tokens
                        </span>
                      </div>
                      <p
                        className="cly-muted cly-small"
                        style={{ margin: "7px 0 0" }}
                      >
                        Source: {item.source}. Linked objects:{" "}
                        {item.linkedIds.join(", ")}.
                      </p>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            <Section
              title="Context packs"
              subtitle="Task-focused selections with a transparent, editable manifest"
            >
              <div className="cly-grid-3">
                {packs.map((pack) => (
                  <Panel className="cly-panel-body" key={pack.id}>
                    <div className="cly-row">
                      <Box size={14} />
                      <strong>{pack.name}</strong>
                    </div>
                    <p
                      className="cly-muted cly-small"
                      style={{ minHeight: 32 }}
                    >
                      {pack.description}
                    </p>
                    <div className="cly-row-between">
                      <span className="cly-faint cly-small">
                        {pack.itemIds.length} objects
                      </span>
                      <Button
                        onClick={() => applyPack(pack.itemIds, pack.name)}
                      >
                        Apply
                      </Button>
                    </div>
                  </Panel>
                ))}
              </div>
            </Section>
          </div>

          <aside className="cly-stack">
            <Panel className="cly-panel-body">
              <div className="cly-row-between">
                <div>
                  <div className="cly-page-kicker">Context budget</div>
                  <strong>{model}</strong>
                </div>
                <div
                  className="cly-budget-ring"
                  style={
                    {
                      "--value": Math.min(100, Math.round(budget.ratio * 100)),
                    } as React.CSSProperties
                  }
                >
                  <div>
                    <strong>{Math.round(budget.ratio * 100)}%</strong>
                    <span>selected</span>
                  </div>
                </div>
              </div>
              <select
                className="cly-select"
                aria-label="Selected model capacity"
                value={model}
                onChange={(event) =>
                  setModel(event.target.value as typeof model)
                }
                style={{ marginTop: 13 }}
              >
                {modelOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
              <div className="cly-divider" style={{ margin: "13px 0" }} />
              <div className="cly-detail-grid">
                <dt>Selected</dt>
                <dd>{budget.tokens.toLocaleString()} tokens</dd>
                <dt>Capacity</dt>
                <dd>{budget.capacity.toLocaleString()} tokens</dd>
                <dt>Usage class</dt>
                <dd>
                  {budget.ratio > 0.75
                    ? "Very High"
                    : budget.ratio > 0.45
                      ? "High"
                      : budget.ratio > 0.2
                        ? "Medium"
                        : "Low"}
                </dd>
                <dt>Stale items</dt>
                <dd>{budget.staleCount}</dd>
              </div>
              {budget.ratio > 0.75 ? (
                <div
                  className="cly-callout"
                  data-tone="warning"
                  style={{ marginTop: 12 }}
                >
                  Context is near the warning threshold. Compress raw sources or
                  remove redundant history.
                </div>
              ) : null}
            </Panel>

            <Panel>
              <div className="cly-panel-header">
                <strong>Selected context</strong>
                <span className="cly-faint cly-small">
                  {selected.length} items
                </span>
              </div>
              <div style={{ maxHeight: 330, overflowY: "auto" }}>
                {selected.map((item) => (
                  <div className="cly-list-row" key={item.id}>
                    <div>
                      <div className="cly-list-title">{item.name}</div>
                      <div className="cly-list-detail">
                        Priority {item.priority} ·{" "}
                        {item.tokens.toLocaleString()} tokens
                      </div>
                    </div>
                    <div className="cly-row">
                      <Button
                        variant="ghost"
                        iconOnly
                        onClick={() => move(item, -1)}
                        aria-label={`Move ${item.name} up`}
                      >
                        <ArrowUp size={12} />
                      </Button>
                      <Button
                        variant="ghost"
                        iconOnly
                        onClick={() => move(item, 1)}
                        aria-label={`Move ${item.name} down`}
                      >
                        <ArrowDown size={12} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel className="cly-panel-body">
              <div className="cly-inspector-label">Selected item actions</div>
              <div className="cly-grid-2">
                <Button
                  onClick={() =>
                    notify(
                      "Preview opened",
                      "Select a context object to inspect its linked evidence and representation.",
                    )
                  }
                >
                  <Eye size={13} /> Preview
                </Button>
                <Button
                  onClick={() =>
                    notify(
                      "Context compressed",
                      "Raw content was replaced with a fixture summary; the original remains restorable.",
                    )
                  }
                >
                  <Sparkles size={13} /> Compress
                </Button>
                <Button
                  onClick={() =>
                    notify(
                      "Original restored",
                      "The raw fixture representation is active again.",
                    )
                  }
                >
                  <RotateCcw size={13} /> Restore
                </Button>
                <Button
                  onClick={() =>
                    notify(
                      "Context branched",
                      "A custom context pack branch was created in this mock session.",
                    )
                  }
                >
                  <GitBranch size={13} /> Branch
                </Button>
                <Button
                  onClick={() =>
                    notify(
                      "Item archived",
                      "Archived items remain traceable but are excluded from agent context.",
                    )
                  }
                >
                  <Archive size={13} /> Archive
                </Button>
                <Button
                  variant="danger"
                  onClick={() =>
                    notify(
                      "Forget requires confirmation",
                      "This prototype does not delete project evidence. The future service will use an explicit confirmation flow.",
                    )
                  }
                >
                  <Trash2 size={13} /> Forget
                </Button>
              </div>
            </Panel>
          </aside>
        </div>
      )}
    </div>
  );
}
