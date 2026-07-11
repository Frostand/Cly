import {
  ArrowDown,
  ArrowUp,
  Check,
  CircleDollarSign,
  Cloud,
  Code2,
  Copy,
  Cpu,
  HardDrive,
  KeyRound,
  Laptop,
  Play,
  Plus,
  RotateCcw,
  Save,
  Shield,
  Trash2,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import {
  Badge,
  Button,
  Metric,
  PageHeader,
  Panel,
  Section,
  Segmented,
  Toggle,
  toneForStatus,
} from "../components/primitives";
import type { AgentNode, AgentPreset } from "../domain/types";
import { mockServices } from "../services/mock-services";
import { useClyStore } from "../store/cly-store";

const providerIcon = (name: string) =>
  name.includes("Git")
    ? Code2
    : name.includes("Docker") || name.includes("Conda")
      ? Cpu
      : name.includes("folder")
        ? HardDrive
        : Cloud;

export function IntegrationsScreen() {
  const integrations = useClyStore((s) => s.data.integrations);
  const setSelected = useClyStore((s) => s.setSelected);
  const notify = useClyStore((s) => s.notify);
  const [category, setCategory] = useState("All");
  const visible = integrations.filter(
    (item) => category === "All" || item.category === category,
  );
  return (
    <div className="cly-page cly-page-wide">
      <PageHeader
        kicker="System"
        title="Integrations & Providers"
        description="Understand what each connection can access, why it is useful, and whether it is local, manual, permissioned, unavailable, or planned."
        actions={
          <Segmented
            value={category}
            options={
              [
                "All",
                "Research",
                "Code",
                "Data",
                "Writing",
                "Runtime",
                "Local",
              ] as const
            }
            onChange={setCategory}
            label="Integration category"
          />
        }
      />
      <Section
        title="Integration catalog"
        subtitle="All states are fixture-driven; no OAuth, synchronization, or secret storage is active"
      >
        <div className="cly-grid-3">
          {visible.map((integration) => {
            const Icon = providerIcon(integration.name);
            return (
              <Panel
                key={integration.id}
                onClick={() => setSelected(integration.id)}
                style={{ cursor: "pointer" }}
              >
                <div className="cly-panel-body">
                  <div className="cly-row-between">
                    <div className="cly-row">
                      <span className="cly-project-mark">
                        <Icon size={14} />
                      </span>
                      <div>
                        <strong>{integration.name}</strong>
                        <div className="cly-faint cly-small">
                          {integration.category}
                        </div>
                      </div>
                    </div>
                    <Badge tone={toneForStatus(integration.status)}>
                      {integration.status}
                    </Badge>
                  </div>
                  <p
                    className="cly-muted cly-small"
                    style={{ minHeight: 32, lineHeight: 1.45 }}
                  >
                    {integration.purpose}
                  </p>
                  <div className="cly-row" style={{ flexWrap: "wrap" }}>
                    {integration.capabilities.map((capability) => (
                      <span className="cly-kbd" key={capability}>
                        {capability}
                      </span>
                    ))}
                  </div>
                  <div className="cly-divider" style={{ margin: "11px 0" }} />
                  <div className="cly-row-between">
                    <span className="cly-faint" style={{ fontSize: 9 }}>
                      {integration.privacy}
                    </span>
                    <Button
                      onClick={(event) => {
                        event.stopPropagation();
                        if (integration.status === "Connected")
                          notify(
                            `${integration.name} settings`,
                            "Permissions and project scope are shown in the inspector.",
                          );
                        else
                          void mockServices.integrations
                            .updateStatus(integration.id, "Setup required")
                            .then(() =>
                              notify(
                                `${integration.name} setup`,
                                "Real connection is unavailable in the UI prototype.",
                              ),
                            );
                      }}
                    >
                      {integration.status === "Connected" ? "Manage" : "Setup"}
                    </Button>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      </Section>
      <Section
        title="Connection modes"
        subtitle="Subscription-based local tools, optional provider keys, and future managed credits remain visibly separate"
      >
        <div className="cly-grid-3">
          <Panel>
            <div className="cly-panel-header">
              <div className="cly-row">
                <Laptop size={15} />
                <strong>Local subscription mode</strong>
              </div>
              <Badge tone="success">Preferred</Badge>
            </div>
            <div className="cly-panel-body cly-stack">
              {[
                "Codex",
                "Claude Code",
                "codex-plugin-cc",
                "Optional local tools",
              ].map((name, index) => (
                <div className="cly-row-between" key={name}>
                  <span>{name}</span>
                  <Badge
                    tone={
                      index < 2
                        ? "success"
                        : index === 2
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {index < 2
                      ? "Installed"
                      : index === 2
                        ? "Manual setup"
                        : "Optional"}
                  </Badge>
                </div>
              ))}
              <p className="cly-muted cly-small">
                Uses signed-in local CLIs when available. No API key is required
                by Cly.
              </p>
            </div>
          </Panel>
          <Panel>
            <div className="cly-panel-header">
              <div className="cly-row">
                <KeyRound size={15} />
                <strong>Bring your own key</strong>
              </div>
              <Badge>Optional</Badge>
            </div>
            <div className="cly-panel-body cly-stack">
              {[
                "OpenAI · sk-proj-••••••12",
                "Anthropic · sk-ant-••••••71",
                "Google Gemini · ••••••93",
                "Compatible provider",
              ].map((name) => (
                <div className="cly-row-between" key={name}>
                  <span>{name}</span>
                  <Button
                    onClick={() =>
                      notify(
                        "Prototype credential",
                        "Fake masked values are never persisted or sent over the network.",
                      )
                    }
                  >
                    Configure
                  </Button>
                </div>
              ))}
              <div className="cly-callout" data-tone="warning">
                Real secrets are not accepted or stored in this phase.
              </div>
            </div>
          </Panel>
          <Panel>
            <div className="cly-panel-header">
              <div className="cly-row">
                <CircleDollarSign size={15} />
                <strong>Managed credits</strong>
              </div>
              <Badge>Planned</Badge>
            </div>
            <div className="cly-panel-body">
              <div className="cly-metric-row">
                <Metric label="Plan" value="—" />
                <Metric label="Credits" value="—" />
              </div>
              <p className="cly-muted cly-small">
                Billing, team plans, included credits, limits, and upgrades are
                intentionally unavailable.
              </p>
              <Button
                disabled
                title="Managed credits are planned for a future phase"
              >
                Unavailable
              </Button>
            </div>
          </Panel>
        </div>
      </Section>
      <Section title="Routing preferences">
        <Panel className="cly-panel-body">
          <div className="cly-grid-3">
            {[
              ["Default research model", "Codex · GPT-5"],
              ["Default code model", "Codex · GPT-5"],
              ["Default review model", "Claude Sonnet"],
              ["Fallback order", "Local → subscription → API"],
              ["Privacy restriction", "No source text to cloud"],
              ["Maximum usage", "High"],
            ].map(([label, value]) => (
              <div className="cly-field" key={label}>
                <span className="cly-muted cly-small">{label}</span>
                <button
                  className="cly-input"
                  type="button"
                  onClick={() =>
                    notify("Routing preference", `${label}: ${value}`)
                  }
                  style={{ textAlign: "left" }}
                >
                  {value}
                </button>
              </div>
            ))}
          </div>
          <label className="cly-row cly-small" style={{ marginTop: 13 }}>
            <input type="checkbox" defaultChecked className="cly-checkbox" />{" "}
            Prefer local subscription routes when available
          </label>
        </Panel>
      </Section>
    </div>
  );
}

export function ModelsAgentsScreen() {
  const presets = useClyStore((s) => s.data.agentPresets);
  const notify = useClyStore((s) => s.notify);
  const [selectedPresetId, setSelectedPresetId] = useState(
    presets[1]?.id ?? presets[0]?.id,
  );
  const original =
    presets.find((item) => item.id === selectedPresetId) ?? presets[0];
  const [nodes, setNodes] = useState<AgentNode[]>(original?.nodes ?? []);
  const [advanced, setAdvanced] = useState(false);
  const [runtime, setRuntime] = useState("45 min");
  const [loops, setLoops] = useState(2);
  const [budget, setBudget] = useState("High");

  const choosePreset = (preset: AgentPreset) => {
    setSelectedPresetId(preset.id);
    setNodes(structuredClone(preset.nodes));
  };
  const updateNode = (id: string, patch: Partial<AgentNode>) =>
    setNodes((current) =>
      current.map((node) => (node.id === id ? { ...node, ...patch } : node)),
    );
  const move = (index: number, direction: -1 | 1) =>
    setNodes((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const save = async () => {
    const preset: AgentPreset = {
      id: `preset-custom-${Date.now()}`,
      name: `${original?.name ?? "Agent plan"} · custom`,
      description: "Custom fixture preset",
      usage: budget as AgentPreset["usage"],
      nodes,
    };
    await mockServices.agents.savePreset(preset);
    setSelectedPresetId(preset.id);
  };

  return (
    <div className="cly-page cly-page-wide">
      <PageHeader
        kicker="System"
        title="Models & Agents"
        description="Start from a task preset, inspect the agent plan, then adjust constrained roles, order, review, context, permissions, runtime, and usage."
        actions={
          <>
            <Button
              onClick={() => {
                setNodes(structuredClone(original?.nodes ?? []));
                notify("Plan reset to recommended");
              }}
            >
              <RotateCcw size={13} /> Reset
            </Button>
            <Button variant="primary" onClick={() => void save()}>
              <Save size={13} /> Save preset
            </Button>
          </>
        }
      />
      <Section
        title="Task presets"
        subtitle="Recommended plans hide complexity until it is useful"
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(185px, 1fr))",
            gap: 8,
          }}
        >
          {presets.map((preset) => (
            <button
              type="button"
              className="cly-panel cly-panel-body"
              key={preset.id}
              onClick={() => choosePreset(preset)}
              data-selected={selectedPresetId === preset.id}
              style={{
                textAlign: "left",
                color: "inherit",
                cursor: "pointer",
                borderColor:
                  selectedPresetId === preset.id
                    ? "var(--cly-accent)"
                    : undefined,
              }}
            >
              <div className="cly-row-between">
                <strong>{preset.name}</strong>
                <Badge tone={toneForStatus(preset.usage)}>{preset.usage}</Badge>
              </div>
              <p
                className="cly-muted cly-small cly-clamp-2"
                style={{ minHeight: 32 }}
              >
                {preset.description}
              </p>
              <div className="cly-faint cly-small">
                {preset.nodes.length} roles ·{" "}
                {preset.nodes.filter((node) => node.mode === "Reviewer").length}{" "}
                reviewer
              </div>
            </button>
          ))}
        </div>
      </Section>
      <Section
        title="Agent topology"
        subtitle="A constrained sequence with parallel branches, review gates, and one final synthesizer"
        actions={
          <Button
            onClick={() =>
              setNodes((current) => [
                ...current,
                {
                  id: `agent-${Date.now()}`,
                  role: "Research Agent",
                  model: "Codex · GPT-5",
                  reasoning: "Medium",
                  contextPack: "Deep Research",
                  mode: "Sequential",
                  canModifyFiles: false,
                  approvalRequired: true,
                },
              ])
            }
          >
            <Plus size={13} /> Add agent
          </Button>
        }
      >
        <div className="cly-topology">
          {nodes.map((node, index) => (
            <div className="cly-agent-node" key={node.id}>
              <div className="cly-row-between">
                <Badge
                  tone={
                    node.mode === "Reviewer"
                      ? "warning"
                      : node.mode === "Synthesis"
                        ? "success"
                        : "info"
                  }
                >
                  {node.mode}
                </Badge>
                <div className="cly-row">
                  <Button
                    variant="ghost"
                    iconOnly
                    onClick={() => move(index, -1)}
                    aria-label={`Move ${node.role} earlier`}
                  >
                    <ArrowUp size={11} />
                  </Button>
                  <Button
                    variant="ghost"
                    iconOnly
                    onClick={() => move(index, 1)}
                    aria-label={`Move ${node.role} later`}
                  >
                    <ArrowDown size={11} />
                  </Button>
                </div>
              </div>
              <input
                className="cly-input cly-agent-role"
                value={node.role}
                onChange={(event) =>
                  updateNode(node.id, { role: event.target.value })
                }
                aria-label={`Role for agent ${index + 1}`}
                style={{ marginTop: 8 }}
              />
              <select
                className="cly-select cly-agent-model"
                value={node.model}
                onChange={(event) =>
                  updateNode(node.id, { model: event.target.value })
                }
                aria-label={`Model for ${node.role}`}
              >
                <option>Codex · GPT-5</option>
                <option>Claude Sonnet</option>
                <option>Local · Qwen</option>
              </select>
              <div className="cly-row-between" style={{ marginTop: 8 }}>
                <Button
                  variant="ghost"
                  iconOnly
                  aria-label={`Duplicate ${node.role}`}
                  onClick={() =>
                    setNodes((current) => [
                      ...current.slice(0, index + 1),
                      { ...node, id: `agent-${Date.now()}` },
                      ...current.slice(index + 1),
                    ])
                  }
                >
                  <Copy size={11} />
                </Button>
                <Button
                  variant="ghost"
                  iconOnly
                  aria-label={`Remove ${node.role}`}
                  onClick={() =>
                    setNodes((current) =>
                      current.filter((item) => item.id !== node.id),
                    )
                  }
                >
                  <Trash2 size={11} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section
        title="Plan controls"
        actions={
          <div className="cly-row cly-small">
            <span>Advanced</span>
            <Toggle
              pressed={advanced}
              onChange={setAdvanced}
              label="Toggle advanced agent controls"
            />
          </div>
        }
      >
        <Panel className="cly-panel-body">
          <div className="cly-grid-3">
            <div className="cly-field">
              <label htmlFor="agent-review-loops">Maximum review loops</label>
              <input
                id="agent-review-loops"
                type="number"
                min={0}
                max={5}
                className="cly-input"
                value={loops}
                onChange={(event) => setLoops(Number(event.target.value))}
              />
            </div>
            <div className="cly-field">
              <label htmlFor="agent-runtime">Maximum runtime</label>
              <select
                id="agent-runtime"
                className="cly-select"
                value={runtime}
                onChange={(event) => setRuntime(event.target.value)}
              >
                <option>15 min</option>
                <option>45 min</option>
                <option>2 hours</option>
              </select>
            </div>
            <div className="cly-field">
              <label htmlFor="agent-budget">Usage budget</label>
              <select
                id="agent-budget"
                className="cly-select"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
              >
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
                <option>Very High</option>
              </select>
            </div>
          </div>
          {advanced ? (
            <div className="cly-grid-3" style={{ marginTop: 14 }}>
              <div className="cly-field">
                <label htmlFor="agent-execution">Execution</label>
                <select className="cly-select" id="agent-execution">
                  <option>Sequential with branches</option>
                  <option>Sequential only</option>
                  <option>Parallel where safe</option>
                </select>
              </div>
              <div className="cly-field">
                <label htmlFor="agent-fallback">Fallback model</label>
                <select className="cly-select" id="agent-fallback">
                  <option>Claude Sonnet</option>
                  <option>Local · Qwen</option>
                  <option>No fallback</option>
                </select>
              </div>
              <div className="cly-field">
                <label htmlFor="agent-context-pack">Context pack</label>
                <select className="cly-select" id="agent-context-pack">
                  <option>Deep Research</option>
                  <option>Claim Audit</option>
                  <option>Reproducibility Audit</option>
                </select>
              </div>
            </div>
          ) : null}
          <div className="cly-row-between" style={{ marginTop: 15 }}>
            <div className="cly-row">
              <Shield size={14} />
              <span className="cly-muted cly-small">
                Human approval required · file writes disabled except Code Agent
                · no external execution
              </span>
            </div>
            <Button
              variant="primary"
              onClick={() =>
                void mockServices.agents.startPreview(selectedPresetId)
              }
            >
              <Play size={13} /> Preview execution
            </Button>
          </div>
        </Panel>
      </Section>
    </div>
  );
}

export function SettingsScreen() {
  const { theme, setTheme } = useTheme();
  const fixtureMode = useClyStore((s) => s.fixtureMode);
  const setFixtureMode = useClyStore((s) => s.setFixtureMode);
  const notify = useClyStore((s) => s.notify);
  const [section, setSection] = useState("Appearance");
  return (
    <div className="cly-page">
      <PageHeader
        kicker="System"
        title="Settings"
        description="Configure appearance, behavior, privacy, research defaults, keyboard shortcuts, and prototype fixture states."
      />
      <div className="cly-settings-layout">
        <nav className="cly-settings-nav" aria-label="Settings sections">
          {[
            "Appearance",
            "Behavior",
            "Privacy",
            "Research defaults",
            "Keyboard shortcuts",
            "Fixture mode",
            "Diagnostics",
          ].map((item) => (
            <button
              key={item}
              type="button"
              aria-current={section === item ? "page" : undefined}
              onClick={() => setSection(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <div>
          {section === "Appearance" ? (
            <Panel className="cly-panel-body">
              <div className="cly-field">
                <span className="cly-muted cly-small">Color theme</span>
                <Segmented
                  value={(theme ?? "dark") as "dark" | "light" | "system"}
                  options={["dark", "light", "system"] as const}
                  onChange={setTheme}
                  label="Color theme"
                />
              </div>
              <div className="cly-divider" style={{ margin: "16px 0" }} />
              <div className="cly-row-between">
                <span>
                  <strong>Dense tables</strong>
                  <span
                    className="cly-muted cly-small"
                    style={{ display: "block" }}
                  >
                    Use compact desktop-native row height
                  </span>
                </span>
                <Toggle
                  pressed
                  onChange={() =>
                    notify(
                      "Density preference",
                      "Comfortable table density will be available in Phase 2.",
                    )
                  }
                  label="Dense tables"
                />
              </div>
            </Panel>
          ) : null}
          {section === "Behavior" ? (
            <SettingsRows
              rows={[
                "Open inspector on selection",
                "Restore last workspace",
                "Confirm destructive mock actions",
                "Show activity completion notifications",
              ]}
            />
          ) : null}
          {section === "Privacy" ? (
            <Panel className="cly-panel-body cly-stack">
              <div className="cly-callout">
                <strong>Local-first by default</strong>
                <p className="cly-muted cly-small">
                  Fixture research data stays in renderer memory. No model,
                  OAuth, sync, or external source requests are made.
                </p>
              </div>
              {[
                "Never include secrets in context",
                "Require approval before file modification",
                "Restrict cloud models from source text",
                "Record provenance for every future mutation",
              ].map((item) => (
                <div className="cly-row-between" key={item}>
                  <span>{item}</span>
                  <Toggle
                    pressed
                    onChange={() =>
                      notify(
                        "Privacy control",
                        `${item} remains enabled in prototype mode.`,
                      )
                    }
                    label={item}
                  />
                </div>
              ))}
            </Panel>
          ) : null}
          {section === "Research defaults" ? (
            <Panel className="cly-panel-body">
              <div className="cly-grid-2">
                {[
                  ["Default project phase", "Exploration"],
                  ["New claim status", "Unsupported"],
                  ["Experiment reproducibility", "Partial until audited"],
                  ["Context warning threshold", "75%"],
                ].map(([label, value]) => (
                  <div className="cly-field" key={label}>
                    <span className="cly-muted cly-small">{label}</span>
                    <button
                      type="button"
                      className="cly-input"
                      style={{ textAlign: "left" }}
                      onClick={() =>
                        notify("Research default", `${label}: ${value}`)
                      }
                    >
                      {value}
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}
          {section === "Keyboard shortcuts" ? (
            <Panel>
              {[
                ["Command palette", "⌘K"],
                ["Open project", "⌘O"],
                ["Project switcher", "⌘⇧O"],
                ["Create contextual object", "⌘N"],
                ["Overview", "⌘1"],
                ["Agent sessions", "⌘2"],
                ["Context", "⌘3"],
                ["Research graph", "⌘4"],
                ["Experiments", "⌘5"],
                ["Claims", "⌘6"],
                ["Settings", "⌘,"],
                ["Toggle inspector", "⌘⌥I"],
                ["Activity drawer", "⌘J"],
                ["Focus current search", "⌘F"],
                ["Close modal / clear selection", "Esc"],
              ].map(([label, shortcut]) => (
                <div className="cly-list-row" key={label}>
                  <span>{label}</span>
                  <kbd className="cly-kbd">{shortcut}</kbd>
                </div>
              ))}
            </Panel>
          ) : null}
          {section === "Fixture mode" ? (
            <Panel className="cly-panel-body">
              <div className="cly-callout" data-tone="warning">
                Development-only state selector. Production builds will not
                expose fixture controls.
              </div>
              <div className="cly-grid-2" style={{ marginTop: 12 }}>
                {(
                  [
                    "empty",
                    "new",
                    "active",
                    "large",
                    "loading",
                    "risks",
                    "offline",
                    "errors",
                  ] as const
                ).map((mode) => (
                  <button
                    className="cly-panel cly-panel-body"
                    type="button"
                    key={mode}
                    onClick={() => setFixtureMode(mode)}
                    style={{
                      textAlign: "left",
                      color: "inherit",
                      cursor: "pointer",
                      borderColor:
                        fixtureMode === mode ? "var(--cly-accent)" : undefined,
                    }}
                  >
                    <div className="cly-row-between">
                      <strong>
                        {mode
                          .replace("risks", "integrity risks")
                          .replace("errors", "integration errors")}
                      </strong>
                      {fixtureMode === mode ? <Check size={13} /> : null}
                    </div>
                  </button>
                ))}
              </div>
            </Panel>
          ) : null}
          {section === "Diagnostics" ? (
            <Panel className="cly-panel-body">
              <div className="cly-detail-grid">
                <dt>Renderer</dt>
                <dd>React 19 · Vite 8</dd>
                <dt>Desktop</dt>
                <dd>Electron 41</dd>
                <dt>Storage</dt>
                <dd>Fixture memory · Dream SQLite retained</dd>
                <dt>Network</dt>
                <dd>No UI prototype requests</dd>
                <dt>Fixture</dt>
                <dd>{fixtureMode}</dd>
                <dt>Build</dt>
                <dd>0.5.0</dd>
              </div>
              <Button
                style={{ marginTop: 14 }}
                onClick={() =>
                  notify(
                    "Diagnostics copied",
                    "Renderer, Electron, fixture, and service-boundary details copied.",
                  )
                }
              >
                Copy diagnostics
              </Button>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SettingsRows({ rows }: { rows: string[] }) {
  const notify = useClyStore((s) => s.notify);
  const [values, setValues] = useState(() =>
    Object.fromEntries(rows.map((row) => [row, true])),
  );
  return (
    <Panel className="cly-panel-body cly-stack">
      {rows.map((row) => (
        <div className="cly-row-between" key={row}>
          <span>{row}</span>
          <Toggle
            pressed={values[row]}
            onChange={(value) => {
              setValues((current) => ({ ...current, [row]: value }));
              notify("Setting updated", `${row}: ${value ? "on" : "off"}`);
            }}
            label={row}
          />
        </div>
      ))}
    </Panel>
  );
}
