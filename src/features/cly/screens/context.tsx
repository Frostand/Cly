import {
  Archive,
  ArrowDown,
  ArrowUp,
  Box,
  Check,
  ChevronRight,
  Database,
  Eye,
  FileText,
  GitBranch,
  Layers3,
  MoreHorizontal,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  SearchInput,
  Segmented,
  Toggle,
  toneForStatus,
} from "../components/primitives";
import { type BudgetSegment, TokenBudgetBar } from "../components/visuals";
import { calculateContextBudget } from "../domain/logic";
import type { ContextItem, ContextPack } from "../domain/types";
import { mockServices } from "../services/mock-services";
import { useClyStore } from "../store/cly-store";
import "../redesign-core.css";

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
type ItemFilter = "All items" | "Included" | "Summaries" | "Excluded";
type InspectorTab = "Preview" | "Metadata" | "Activity";

const projectContextCategories = [
  ["Project memory", "Project", Database],
  ["Recent sources", "Sources", FileText],
  ["Claims", "Claims", ShieldIcon],
  ["Experiments", "Experiments", FlaskIcon],
  ["Decisions", "Decisions", GitBranch],
] as const;
const inspectorTabs = ["Preview", "Metadata", "Activity"] as const;

export function ContextScreen() {
  const items = useClyStore((s) => s.data.contextItems);
  const packs = useClyStore((s) => s.data.contextPacks);
  const selectedId = useClyStore((s) => s.selectedId);
  const setSelected = useClyStore((s) => s.setSelected);
  const updateItem = useClyStore((s) => s.updateContextItem);
  const notify = useClyStore((s) => s.notify);
  const inspectorOpen = useClyStore((s) => s.inspectorOpen);
  const toggleInspector = useClyStore((s) => s.toggleInspector);
  const [packQuery, setPackQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [customPacks, setCustomPacks] = useState<ContextPack[]>([]);
  const [model, setModel] = useState<(typeof modelOptions)[number]>(
    modelOptions[0],
  );
  const [previewMode, setPreviewMode] = useState<"Composer" | "Agent preview">(
    "Composer",
  );
  const [itemFilter, setItemFilter] = useState<ItemFilter>("All items");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("Preview");
  const [activePackId, setActivePackId] = useState(
    packs.find((pack) => pack.id === "pack-paper")?.id ?? packs[0]?.id ?? "",
  );
  const availablePacks = [...packs, ...customPacks];
  const activePack =
    availablePacks.find((pack) => pack.id === activePackId) ??
    availablePacks[0] ??
    null;
  const selectedItem =
    items.find((item) => item.id === selectedId) ??
    items.find((item) => item.included) ??
    items[0] ??
    null;
  const budget = useMemo(
    () => calculateContextBudget(items, capacities[model]),
    [items, model],
  );
  const budgetSegments = useMemo<BudgetSegment[]>(() => {
    const tones: BudgetSegment["tone"][] = [
      "accent",
      "info",
      "success",
      "warning",
      "danger",
    ];
    return Object.entries(
      items
        .filter((item) => item.included)
        .reduce<Record<string, number>>((result, item) => {
          result[item.category] = (result[item.category] ?? 0) + item.tokens;
          return result;
        }, {}),
    ).map(([label, value], index) => ({
      label,
      value,
      tone: tones[index % tones.length],
    }));
  }, [items]);
  const selected = items
    .filter((item) => item.included)
    .sort((a, b) => a.priority - b.priority);
  const filtered = items.filter((item) => {
    const matchesCategory = !categoryFilter || item.category === categoryFilter;
    const matchesFilter =
      itemFilter === "All items" ||
      (itemFilter === "Included" && item.included) ||
      (itemFilter === "Summaries" && item.representation === "Summary") ||
      (itemFilter === "Excluded" && !item.included);
    return matchesCategory && matchesFilter;
  });
  const normalizedPackQuery = packQuery.trim().toLowerCase();
  const visiblePackCategories = projectContextCategories.filter(
    ([label, category]) =>
      !normalizedPackQuery ||
      `${label} ${category}`.toLowerCase().includes(normalizedPackQuery),
  );
  const visiblePacks = availablePacks.filter(
    (pack) =>
      !normalizedPackQuery ||
      `${pack.name} ${pack.description}`
        .toLowerCase()
        .includes(normalizedPackQuery),
  );

  const applyPack = (itemIds: string[], name: string, id?: string) => {
    items.forEach((item) => {
      updateItem(item.id, { included: itemIds.includes(item.id) });
    });
    if (id) setActivePackId(id);
    notify(
      "Context pack applied",
      `${name} selected ${itemIds.length} context objects.`,
    );
  };

  const move = (item: ContextItem, direction: -1 | 1) =>
    updateItem(item.id, { priority: Math.max(1, item.priority + direction) });

  const createPack = () => {
    const ordinal = customPacks.length + 1;
    const pack: ContextPack = {
      id: `local-pack-${Date.now()}`,
      name: `Custom pack ${ordinal}`,
      description: "Saved from the current context selection.",
      itemIds: selected.map((item) => item.id),
    };
    setCustomPacks((current) => [...current, pack]);
    setActivePackId(pack.id);
    setPackQuery("");
    notify(
      "Context pack created",
      `${pack.name} saved ${pack.itemIds.length} included objects.`,
    );
  };

  if (items.length === 0)
    return (
      <div className="cly-page cly-page-wide cly-route-context">
        <PageHeader
          kicker="Workspace"
          title="Context Composer"
          description="Choose exactly what an agent receives."
        />
        <EmptyState
          title="No context objects"
          description="Add research objects to build a context pack."
          action={<Button variant="primary">Add custom note</Button>}
        />
      </div>
    );

  return (
    <div className="cly-page cly-page-wide cly-route-context cly-core-context">
      <PageHeader
        kicker="Workspace"
        title="Context Composer"
        description="Compose the right evidence envelope for deeper, more accurate reasoning."
        actions={
          <>
            <Segmented
              value={previewMode}
              options={["Composer", "Agent preview"] as const}
              onChange={setPreviewMode}
              label="Context view"
            />
            {!inspectorOpen ? (
              <Button onClick={toggleInspector}>
                <Eye size={13} /> Show details
              </Button>
            ) : null}
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

      <section
        className="cly-core-context-summary"
        aria-label="Current context pack"
      >
        <label>
          <span>Current pack</span>
          <select
            value={activePack?.id ?? ""}
            onChange={(event) => {
              const pack = availablePacks.find(
                (item) => item.id === event.target.value,
              );
              if (pack) applyPack(pack.itemIds, pack.name, pack.id);
            }}
          >
            {availablePacks.map((pack) => (
              <option key={pack.id} value={pack.id}>
                {pack.name}
              </option>
            ))}
          </select>
        </label>
        <div className="cly-core-context-budget">
          <div>
            <span>Token budget</span>
            <strong>
              {Math.round(budget.ratio * 100)}% ·{" "}
              {budget.tokens.toLocaleString()} /{" "}
              {budget.capacity.toLocaleString()}
            </strong>
          </div>
          <TokenBudgetBar
            segments={budgetSegments}
            capacity={budget.capacity}
            label={`${model} context budget`}
          />
        </div>
        <label>
          <span>Model capacity</span>
          <select
            aria-label="Selected model capacity"
            value={model}
            onChange={(event) => setModel(event.target.value as typeof model)}
          >
            {modelOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
      </section>

      <div
        className="cly-core-context-workspace"
        data-inspector={inspectorOpen ? "open" : "closed"}
      >
        <aside className="cly-core-context-packs" aria-label="Context packs">
          <header>
            <strong>Context packs</strong>
            <Button
              iconOnly
              variant="ghost"
              aria-label="Create context pack from included items"
              onClick={createPack}
            >
              <Plus size={13} />
            </Button>
          </header>
          <SearchInput
            value={packQuery}
            onChange={setPackQuery}
            placeholder="Search context packs…"
            label="Search context packs"
          />
          <div className="cly-core-pack-group">
            <span>Project context</span>
            {visiblePackCategories.map(([label, category, Icon]) => {
              const categoryItems = items.filter(
                (item) => item.category === category,
              );
              const includedCount = categoryItems.filter(
                (item) => item.included,
              ).length;
              return (
                <button
                  type="button"
                  key={String(label)}
                  data-selected={categoryFilter === category}
                  onClick={() => {
                    setItemFilter("All items");
                    setCategoryFilter((current) =>
                      current === category ? null : String(category),
                    );
                  }}
                >
                  <span className="cly-core-pack-icon">
                    <Icon size={12} />
                  </span>
                  <span>
                    <strong>{String(label)}</strong>
                    <small>{categoryItems.length} objects</small>
                  </span>
                  <small>{includedCount}</small>
                </button>
              );
            })}
          </div>
          <div className="cly-core-pack-group">
            <span>Saved packs</span>
            {visiblePacks.map((pack) => {
              const packTokens = items
                .filter((item) => pack.itemIds.includes(item.id))
                .reduce((sum, item) => sum + item.tokens, 0);
              return (
                <button
                  type="button"
                  key={pack.id}
                  data-selected={activePack?.id === pack.id}
                  onClick={() => applyPack(pack.itemIds, pack.name, pack.id)}
                >
                  <span className="cly-core-pack-icon">
                    <Layers3 size={12} />
                  </span>
                  <span>
                    <strong>{pack.name}</strong>
                    <small>
                      {pack.itemIds.length} objects ·{" "}
                      {(packTokens / 1000).toFixed(1)}k
                    </small>
                  </span>
                  <small>
                    {Math.round((packTokens / capacities[model]) * 100)}%
                  </small>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="cly-core-context-items">
          <div
            className="cly-core-context-tabs"
            role="toolbar"
            aria-label="Context item filter"
          >
            {(["All items", "Included", "Summaries", "Excluded"] as const).map(
              (filter) => {
                const count = items.filter((item) =>
                  filter === "All items"
                    ? true
                    : filter === "Included"
                      ? item.included
                      : filter === "Summaries"
                        ? item.representation === "Summary"
                        : !item.included,
                ).length;
                return (
                  <button
                    type="button"
                    key={filter}
                    aria-pressed={itemFilter === filter}
                    onClick={() => setItemFilter(filter)}
                  >
                    {filter} <span>{count}</span>
                  </button>
                );
              },
            )}
          </div>

          {previewMode === "Composer" ? (
            <div className="cly-core-context-table-wrap">
              <div className="cly-core-context-table-scroll">
                <table
                  className="cly-core-context-table"
                  aria-label="Context objects"
                >
                  <thead>
                    <tr className="cly-core-context-table-head">
                      <th scope="col">Item</th>
                      <th scope="col">Type</th>
                      <th scope="col">Tokens</th>
                      <th scope="col">Freshness</th>
                      <th scope="col">Include</th>
                      <th scope="col">Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => (
                      <tr
                        className="cly-core-context-row-v2"
                        key={item.id}
                        data-selected={selectedItem?.id === item.id}
                      >
                        <td className="cly-core-context-item-cell">
                          <button
                            type="button"
                            onClick={() => setSelected(item.id)}
                            aria-label={`Open details for ${item.name}`}
                          >
                            <span
                              className="cly-core-object-icon"
                              data-type={item.category}
                            >
                              {item.pinned ? (
                                <Pin size={11} />
                              ) : (
                                <FileText size={11} />
                              )}
                            </span>
                            <span>
                              <strong>{item.name}</strong>
                              <small>{item.source}</small>
                            </span>
                          </button>
                        </td>
                        <td>
                          <Badge>{item.type}</Badge>
                        </td>
                        <td>{item.tokens.toLocaleString()}</td>
                        <td>
                          <Badge tone={toneForStatus(item.freshness)}>
                            {item.freshness}
                          </Badge>
                        </td>
                        <td>
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
                        </td>
                        <td>{item.priority}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filtered.length ? (
                  <div className="cly-core-context-no-results" role="status">
                    No context objects match this view.
                  </div>
                ) : null}
              </div>
              <footer>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setItemFilter("Excluded");
                    setCategoryFilter(null);
                    notify(
                      "Choose context objects",
                      "Excluded objects are ready to review and include.",
                    );
                  }}
                >
                  <Plus size={12} /> Add items
                </Button>
                <span>
                  {filtered.length} visible · {selected.length} included
                </span>
                <span>Ordered by priority</span>
              </footer>
            </div>
          ) : (
            <div className="cly-core-agent-preview">
              <header>
                <div>
                  <strong>Exact agent context preview</strong>
                  <span>
                    Ordered content envelope · excluded objects and secrets are
                    omitted
                  </span>
                </div>
                <Button
                  onClick={() =>
                    notify(
                      "Preview copied",
                      "Context manifest copied as fixture text.",
                    )
                  }
                >
                  Copy manifest
                </Button>
              </header>
              <ol>
                {selected.map((item, index) => (
                  <li key={item.id}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{item.name}</strong>
                      <small>
                        {item.source} · {item.linkedIds.join(", ")}
                      </small>
                    </div>
                    <Badge tone={toneForStatus(item.freshness)}>
                      {item.freshness}
                    </Badge>
                    <span>
                      {item.representation} · {item.tokens.toLocaleString()}{" "}
                      tokens
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </main>

        {inspectorOpen && selectedItem ? (
          <aside
            className="cly-core-context-inspector"
            data-inline-inspector
            aria-label="Selected context object details"
          >
            <header>
              <div>
                <Badge tone="info">{selectedItem.category}</Badge>
                <h2>{selectedItem.name}</h2>
                <p>{selectedItem.source}</p>
              </div>
              <Button
                iconOnly
                variant="ghost"
                aria-label="Close context details"
                onClick={toggleInspector}
              >
                <X size={14} />
              </Button>
            </header>
            <div
              className="cly-core-inspector-tabs"
              role="tablist"
              aria-label="Context object detail view"
            >
              {inspectorTabs.map((tab, index) => (
                <button
                  id={`context-inspector-tab-${tab.toLowerCase()}`}
                  type="button"
                  role="tab"
                  key={tab}
                  tabIndex={inspectorTab === tab ? 0 : -1}
                  aria-selected={inspectorTab === tab}
                  aria-controls="context-inspector-panel"
                  onClick={() => setInspectorTab(tab)}
                  onKeyDown={(event) => {
                    if (
                      event.key !== "ArrowLeft" &&
                      event.key !== "ArrowRight" &&
                      event.key !== "Home" &&
                      event.key !== "End"
                    )
                      return;
                    event.preventDefault();
                    const nextIndex =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? inspectorTabs.length - 1
                          : (index +
                              (event.key === "ArrowRight" ? 1 : -1) +
                              inspectorTabs.length) %
                            inspectorTabs.length;
                    setInspectorTab(inspectorTabs[nextIndex]);
                    event.currentTarget.parentElement
                      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                      [nextIndex]?.focus();
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div
              className="cly-core-context-inspector-body"
              id="context-inspector-panel"
              role="tabpanel"
              aria-labelledby={`context-inspector-tab-${inspectorTab.toLowerCase()}`}
            >
              {inspectorTab === "Preview" ? (
                <>
                  <section>
                    <span>Summary</span>
                    <p>
                      {selectedItem.name} contributes a{" "}
                      {selectedItem.representation.toLowerCase()} representation
                      from {selectedItem.source}. It is linked to{" "}
                      {selectedItem.linkedIds.length} research objects and
                      carries {selectedItem.confidence}% extraction confidence.
                    </p>
                  </section>
                  <section>
                    <span>Linked objects</span>
                    <div className="cly-core-linked-objects">
                      {selectedItem.linkedIds.map((id) => (
                        <button
                          type="button"
                          key={id}
                          onClick={() => setSelected(id)}
                        >
                          <GitBranch size={11} /> {id}{" "}
                          <ChevronRight size={11} />
                        </button>
                      ))}
                    </div>
                  </section>
                </>
              ) : null}
              {inspectorTab === "Metadata" ? (
                <>
                  <section>
                    <span>Context metadata</span>
                    <dl>
                      <dt>Representation</dt>
                      <dd>{selectedItem.representation}</dd>
                      <dt>Tokens</dt>
                      <dd>{selectedItem.tokens.toLocaleString()}</dd>
                      <dt>Freshness</dt>
                      <dd>
                        <Badge tone={toneForStatus(selectedItem.freshness)}>
                          {selectedItem.freshness}
                        </Badge>
                      </dd>
                      <dt>Confidence</dt>
                      <dd>{selectedItem.confidence}%</dd>
                      <dt>Priority</dt>
                      <dd>{selectedItem.priority}</dd>
                    </dl>
                  </section>
                  <section>
                    <span>Ordering</span>
                    <div className="cly-core-order-actions">
                      <Button onClick={() => move(selectedItem, -1)}>
                        <ArrowUp size={12} /> Move up
                      </Button>
                      <Button onClick={() => move(selectedItem, 1)}>
                        <ArrowDown size={12} /> Move down
                      </Button>
                    </div>
                  </section>
                </>
              ) : null}
              {inspectorTab === "Activity" ? (
                <>
                  <section>
                    <span>Current state</span>
                    <p>
                      {selectedItem.included ? "Included" : "Excluded"} at
                      priority {selectedItem.priority} as a{" "}
                      {selectedItem.representation.toLowerCase()} context
                      object.
                    </p>
                  </section>
                  <section>
                    <span>Source activity</span>
                    <p>
                      {selectedItem.freshness} source ·{" "}
                      {selectedItem.confidence}% extraction confidence ·{" "}
                      {selectedItem.linkedIds.length} linked research objects.
                    </p>
                  </section>
                </>
              ) : null}
            </div>
            <footer>
              <Button
                onClick={() =>
                  void mockServices.context.setPinned(
                    selectedItem.id,
                    !selectedItem.pinned,
                  )
                }
              >
                {selectedItem.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                {selectedItem.pinned ? "Unpin" : "Pin"}
              </Button>
              <Button
                onClick={() =>
                  void mockServices.context.setRepresentation(
                    selectedItem.id,
                    selectedItem.representation === "Raw" ? "Summary" : "Raw",
                  )
                }
              >
                <Sparkles size={12} />
                {selectedItem.representation === "Raw" ? "Compress" : "Use raw"}
              </Button>
              <Button
                onClick={() =>
                  notify(
                    "Original restored",
                    "Raw source representation restored.",
                  )
                }
              >
                <RotateCcw size={12} /> Restore
              </Button>
              <Button
                onClick={() =>
                  notify(
                    "Context branched",
                    "A custom pack branch was created.",
                  )
                }
              >
                <GitBranch size={12} /> Branch
              </Button>
              <Button
                onClick={() =>
                  notify(
                    "Item archived",
                    "The object remains traceable but is excluded.",
                  )
                }
              >
                <Archive size={12} /> Archive
              </Button>
              <Button
                variant="danger"
                onClick={() =>
                  notify(
                    "Forget requires confirmation",
                    "Project evidence is never deleted without explicit confirmation.",
                  )
                }
              >
                <Trash2 size={12} /> Forget
              </Button>
              <Button
                iconOnly
                variant="ghost"
                aria-label="More context actions"
              >
                <MoreHorizontal size={13} />
              </Button>
            </footer>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function ShieldIcon({ size = 12 }: { size?: number }) {
  return <Check size={size} />;
}

function FlaskIcon({ size = 12 }: { size?: number }) {
  return <Box size={size} />;
}
