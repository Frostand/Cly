import {
  Bot,
  Check,
  ChevronDown,
  GitBranch,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Dialog, Segmented } from "../components/primitives";
import { useClyStore } from "../store/cly-store";
import type {
  AgentIdentity,
  AgentSession,
  AgentSessionsMode,
  NewAgentSessionInput,
} from "./types";
import {
  agentStatusLabel,
  contextModeLabel,
  toneForAgentStatus,
} from "./utils";

export function AgentSessionsModeSwitcher({
  compact = false,
}: {
  compact?: boolean;
}) {
  const mode = useClyStore((state) => state.agentSessionsMode);
  const setMode = useClyStore((state) => state.setAgentSessionsMode);
  return (
    <div
      className={
        compact ? "agent-mode-switcher is-compact" : "agent-mode-switcher"
      }
    >
      <Segmented<AgentSessionsMode>
        value={mode}
        options={["overview", "chat"]}
        onChange={setMode}
        label="Agent Sessions mode"
      />
    </div>
  );
}

const formatTokens = (value: number) =>
  new Intl.NumberFormat("en", { notation: "compact" }).format(value);

const formatCost = (minorUnits: number) => `$${(minorUnits / 100).toFixed(2)}`;

export function ClyDevTaskIdentitySurface({
  session,
}: {
  session: AgentSession;
}) {
  const identity = session.identity;
  return (
    <section className="cly-dev-task-identity" aria-label="Task identity">
      <div className="cly-dev-identity-groups">
        <IdentityGroup label="Project" value={identity.project.name} />
        <IdentityGroup
          label="Repository"
          value={identity.repository.name}
          detail={identity.repository.remote}
        />
        <IdentityGroup
          label="Workspace"
          value={identity.workspace.branch}
          detail={
            identity.workspace.worktree ??
            identity.workspace.commit ??
            "Primary checkout"
          }
          mono
        />
        <IdentityGroup
          label="Machine"
          value={identity.machine.name}
          detail={identity.machine.id}
        />
        <IdentityGroup
          label="Provider"
          value={`${identity.provider.model} · ${identity.provider.reasoningLevel}`}
          detail={identity.provider.id}
        />
        <IdentityGroup
          label="Budget"
          value={`${formatTokens(identity.budget.usedTokens)} / ${formatTokens(identity.budget.maxTokens)} tokens`}
          detail={`${formatCost(identity.budget.usedCostMinorUnits)} / ${formatCost(identity.budget.maxCostMinorUnits)}`}
        />
        <IdentityGroup
          label="Objective"
          value={identity.objective.title}
          detail={identity.objective.issueId}
        />
        <IdentityGroup
          label="Research impact"
          value={identity.researchImpact.summary}
          detail={`${identity.researchImpact.risk} risk · ${identity.researchImpact.objectIds.length} objects`}
        />
      </div>
    </section>
  );
}

function IdentityGroup({
  label,
  value,
  detail,
  mono = false,
}: {
  label: string;
  value: string;
  detail?: string;
  mono?: boolean;
}) {
  return (
    <fieldset
      className="cly-dev-identity-group"
      title={[value, detail].filter(Boolean).join(" · ")}
    >
      <legend>{label}</legend>
      <strong data-mono={mono}>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </fieldset>
  );
}

const defaultInput: NewAgentSessionInput = {
  title: "",
  objective: "",
  provider: "OpenAI",
  model: "GPT-5",
  reasoningLevel: "High",
  preset: "Code Implementation",
  contextPackName: "Claim Audit Pack",
  approvalPolicy: "Approve writes and network",
  branchPreference: "agent/research-session",
  usageBudget: "$10",
};

export function NewSessionFlow() {
  const open = useClyStore((state) => state.newAgentSessionOpen);
  const setOpen = useClyStore((state) => state.setNewAgentSessionOpen);
  const createSession = useClyStore((state) => state.createAgentSession);
  const notify = useClyStore((state) => state.notify);
  const [input, setInput] = useState(defaultInput);
  const canCreate = Boolean(input.title.trim() && input.objective.trim());
  const update = <K extends keyof NewAgentSessionInput>(
    key: K,
    value: NewAgentSessionInput[K],
  ) => setInput((current) => ({ ...current, [key]: value }));
  const create = (openChat: boolean) => {
    if (!canCreate) return;
    createSession(input, openChat);
    notify(
      "Agent session created",
      openChat
        ? "The Orchestrator is preparing the fixture-backed task plan."
        : "The new session is available in Overview.",
    );
    setInput(defaultInput);
  };

  return (
    <Dialog
      open={open}
      title="New agent session"
      description="Configure the Orchestrator, delegated-agent team, context, permissions, and budget. No external model calls will be made."
      onClose={() => setOpen(false)}
      wide
      footer={
        <>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!canCreate} onClick={() => create(false)}>
            Create without opening
          </Button>
          <Button
            variant="primary"
            disabled={!canCreate}
            onClick={() => create(true)}
          >
            <Sparkles size={13} /> Start session
          </Button>
        </>
      }
    >
      <div className="agent-new-session-grid">
        <label className="agent-field agent-field-wide">
          <span>Session title</span>
          <input
            aria-label="Session title"
            value={input.title}
            onChange={(event) => update("title", event.target.value)}
            placeholder="Audit the primary result"
            autoFocus
          />
        </label>
        <label className="agent-field agent-field-wide">
          <span>Session goal</span>
          <textarea
            aria-label="Session goal"
            value={input.objective}
            onChange={(event) => update("objective", event.target.value)}
            placeholder="Describe the research objective, desired evidence, and stopping condition…"
          />
        </label>
        <SelectField
          label="Orchestrator provider"
          value={input.provider}
          options={["OpenAI", "Anthropic", "Local CLI"]}
          onChange={(value) => update("provider", value)}
        />
        <SelectField
          label="Model"
          value={input.model}
          options={["GPT-5", "Claude Opus 4.6", "Codex CLI"]}
          onChange={(value) => update("model", value)}
        />
        <SelectField
          label="Reasoning level"
          value={input.reasoningLevel}
          options={["Low", "Medium", "High"]}
          onChange={(value) =>
            update(
              "reasoningLevel",
              value as NewAgentSessionInput["reasoningLevel"],
            )
          }
        />
        <SelectField
          label="Agent-team preset"
          value={input.preset}
          options={[
            "Code Implementation",
            "Claim Audit",
            "Literature Review",
            "Reproducibility Audit",
          ]}
          onChange={(value) => update("preset", value)}
        />
        <SelectField
          label="Context pack"
          value={input.contextPackName}
          options={[
            "Claim Audit Pack",
            "Deep Research",
            "Notebook Cleanup",
            "Reproducibility Audit",
          ]}
          onChange={(value) => update("contextPackName", value)}
        />
        <SelectField
          label="Approval policy"
          value={input.approvalPolicy}
          options={[
            "Approve writes and network",
            "Approve consequential actions",
            "Read-only",
          ]}
          onChange={(value) => update("approvalPolicy", value)}
        />
        <label className="agent-field">
          <span>Branch / worktree</span>
          <input
            aria-label="Branch or worktree preference"
            value={input.branchPreference}
            onChange={(event) => update("branchPreference", event.target.value)}
          />
        </label>
        <SelectField
          label="Usage budget"
          value={input.usageBudget}
          options={["$5", "$10", "$25", "No fixture limit"]}
          onChange={(value) => update("usageBudget", value)}
        />
      </div>
      <div className="agent-setup-summary">
        <Bot size={15} />
        <span>
          <strong>Orchestrator</strong> coordinates fully capable delegated
          agents. Each agent receives only the context and permissions shown in
          its configuration.
        </span>
      </div>
    </Dialog>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="agent-field">
      <span>{label}</span>
      <div className="agent-select-wrap">
        <select
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <ChevronDown size={12} />
      </div>
    </label>
  );
}

export function AgentConfigurationSheet() {
  const configurationId = useClyStore((state) => state.agentConfigurationId);
  const sessions = useClyStore((state) => state.data.agentSessions);
  const setConfigurationId = useClyStore(
    (state) => state.setAgentConfigurationId,
  );
  const updateAgent = useClyStore((state) => state.updateDelegatedAgent);
  const session = useMemo(
    () =>
      sessions.find(
        (item) =>
          item.orchestrator.id === configurationId ||
          item.delegatedAgents.some((agent) => agent.id === configurationId),
      ),
    [configurationId, sessions],
  );
  const identity = session
    ? session.orchestrator.id === configurationId
      ? session.orchestrator
      : session.delegatedAgents.find((agent) => agent.id === configurationId)
    : undefined;
  const [draft, setDraft] = useState<AgentIdentity | null>(null);
  const active = draft?.id === identity?.id ? draft : identity;

  const save = () => {
    if (!session || !active) return;
    if (session.orchestrator.id !== active.id) {
      updateAgent(session.id, active.id, active);
    }
    setConfigurationId(null);
  };

  return (
    <Dialog
      open={Boolean(identity)}
      title={active ? `Configure ${active.name}` : "Configure agent"}
      description="Delegated agents are fully capable independent sessions. Orchestration and task routing determine their subordinate behavior."
      onClose={() => setConfigurationId(null)}
      wide
      footer={
        <>
          <Button onClick={() => setConfigurationId(null)}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            <Check size={13} /> Save configuration
          </Button>
        </>
      }
    >
      {active ? (
        <div className="agent-config-layout">
          <div className="agent-config-identity">
            <div className="agent-avatar large">
              <Bot size={22} />
            </div>
            <div>
              <h3>{active.name}</h3>
              <p>{active.roleLabel}</p>
            </div>
            <Badge tone={toneForAgentStatus(active.status)}>
              {agentStatusLabel[active.status]}
            </Badge>
          </div>
          <div className="agent-new-session-grid">
            <label className="agent-field">
              <span>Name</span>
              <input
                value={active.name}
                onChange={(event) =>
                  setDraft({ ...active, name: event.target.value })
                }
              />
            </label>
            <SelectField
              label="Model"
              value={active.model}
              options={["GPT-5", "Claude Opus 4.6", "Codex CLI"]}
              onChange={(model) => setDraft({ ...active, model })}
            />
            <SelectField
              label="Reasoning level"
              value={active.reasoningLevel}
              options={["Low", "Medium", "High"]}
              onChange={(reasoningLevel) =>
                setDraft({
                  ...active,
                  reasoningLevel:
                    reasoningLevel as AgentIdentity["reasoningLevel"],
                })
              }
            />
            <SelectField
              label="Context access"
              value={active.contextMode}
              options={Object.keys(contextModeLabel)}
              onChange={(contextMode) =>
                setDraft({
                  ...active,
                  contextMode: contextMode as AgentIdentity["contextMode"],
                })
              }
            />
            <label className="agent-field">
              <span>Instance count</span>
              <input
                type="number"
                min={1}
                value={active.instanceCount ?? 1}
                onChange={(event) =>
                  setDraft({
                    ...active,
                    instanceCount: Number(event.target.value),
                  })
                }
              />
            </label>
            <label className="agent-field">
              <span>Role parallel cap</span>
              <input
                type="number"
                min={1}
                value={active.maxParallel ?? 1}
                onChange={(event) =>
                  setDraft({
                    ...active,
                    maxParallel: Number(event.target.value),
                  })
                }
              />
            </label>
            {(
              [
                ["maxInputTokens", "Input token cap", 32000],
                ["maxOutputTokens", "Output token cap", 8000],
                ["maxCostMinorUnits", "Cost cap (minor units)", 500],
                ["maxRuntimeMs", "Runtime cap (ms)", 2700000],
              ] as const
            ).map(([key, label, fallback]) => (
              <label className="agent-field" key={key}>
                <span>{label}</span>
                <input
                  type="number"
                  min={key === "maxRuntimeMs" ? 1 : 0}
                  value={active.budget?.[key] ?? fallback}
                  onChange={(event) =>
                    setDraft({
                      ...active,
                      budget: {
                        maxInputTokens: active.budget?.maxInputTokens ?? 32000,
                        maxOutputTokens: active.budget?.maxOutputTokens ?? 8000,
                        maxCostMinorUnits:
                          active.budget?.maxCostMinorUnits ?? 500,
                        maxRuntimeMs: active.budget?.maxRuntimeMs ?? 2700000,
                        [key]: Number(event.target.value),
                      },
                    })
                  }
                />
              </label>
            ))}
            {(
              [
                ["tools", "Allowed tools"],
                ["allowedContextSources", "Context sources"],
                ["allowedFileGlobs", "File globs"],
                ["approvalCheckpoints", "Approval checkpoints"],
              ] as const
            ).map(([key, label]) => (
              <label className="agent-field" key={key}>
                <span>{label}</span>
                <input
                  value={(active[key] ?? []).join(", ")}
                  onChange={(event) =>
                    setDraft({
                      ...active,
                      [key]: event.target.value
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
            ))}
            <label className="agent-field agent-field-wide">
              <span>Task</span>
              <textarea
                value={active.task}
                onChange={(event) =>
                  setDraft({ ...active, task: event.target.value })
                }
              />
            </label>
          </div>
          <div className="agent-config-section">
            <div className="agent-config-section-title">
              <ShieldCheck size={14} /> Permissions
            </div>
            <div className="agent-permission-grid">
              {[
                ["Read files", active.permissions.canReadFiles],
                ["Write files", active.permissions.canWriteFiles],
                ["Run commands", active.permissions.canRunCommands],
                ["Network access", active.permissions.canAccessNetwork],
              ].map(([label, enabled]) => (
                <span key={String(label)} data-enabled={enabled}>
                  <Check size={11} /> {label}
                </span>
              ))}
            </div>
          </div>
          <div className="agent-config-meta">
            <span>
              <Users size={13} /> {contextModeLabel[active.contextMode]}
            </span>
            <span>
              <GitBranch size={13} />{" "}
              {active.worktree ?? "Shared project branch"}
            </span>
            <span>
              <ShieldCheck size={13} /> {active.approvalPolicy}
            </span>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
