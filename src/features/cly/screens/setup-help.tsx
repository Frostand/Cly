import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Circle,
  Compass,
  LifeBuoy,
  RotateCcw,
  Search,
} from "lucide-react";
import { StatusIndicator, WorkspaceHeader } from "../components/design-system";
import { Button } from "../components/primitives";
import { restartOnboarding } from "../domain/onboarding";
import type { ScreenId } from "../domain/types";
import {
  loadOnboardingDraft,
  saveOnboardingDraft,
} from "../services/onboarding-storage";
import { useClyStore } from "../store/cly-store";

interface SetupStep {
  id: string;
  label: string;
  detail: string;
  destination: ScreenId;
  action: string;
  complete: boolean;
}

export function SetupHelpScreen() {
  const data = useClyStore((state) => state.data);
  const setScreen = useClyStore((state) => state.setScreen);
  const loadFromApi = useClyStore((state) => state.loadFromApi);
  const activeProjectId = useClyStore((state) => state.activeProjectId);
  const setCommandPaletteOpen = useClyStore(
    (state) => state.setCommandPaletteOpen,
  );
  const steps: SetupStep[] = [
    {
      id: "project",
      label: "Open a project",
      detail: "Choose the project that will hold this evidence chain.",
      destination: "overview",
      action: "Open overview",
      complete: data.projects.some((project) => project.id === activeProjectId),
    },
    {
      id: "source",
      label: "Add a source",
      detail: "Import a paper, dataset, note, or webpage.",
      destination: "sources",
      action: "Import source",
      complete: data.sources.length > 0,
    },
    {
      id: "claim",
      label: "Draft a claim",
      detail: "State the result and connect supporting evidence.",
      destination: "claims",
      action: "Draft claim",
      complete: data.claims.length > 0,
    },
    {
      id: "run",
      label: "Record a run",
      detail: "Capture the experiment, inputs, code, and result.",
      destination: "experiments",
      action: "Open experiments",
      complete: data.experiments.length > 0 && data.runs.length > 0,
    },
    {
      id: "review",
      label: "Review reproducibility",
      detail: "Resolve open findings before sharing the evidence package.",
      destination: "reproducibility",
      action: "Open audit",
      complete:
        data.audits.length > 0 &&
        data.findings.every((finding) => finding.status !== "Open"),
    },
  ];
  const completed = steps.filter((step) => step.complete).length;
  const next = steps.find((step) => !step.complete) ?? steps.at(-1);

  return (
    <div className="cly-page cly-page-wide cly-route-help">
      <WorkspaceHeader
        eyebrow="Set up"
        title="Setup & Help"
        description="Build a source-to-claim evidence chain, recover interrupted work, and find advanced tools."
        metadata={
          <StatusIndicator
            tone={completed === steps.length ? "success" : "info"}
          >
            {completed} of {steps.length} complete
          </StatusIndicator>
        }
        actions={
          <div className="cly-help-actions">
            <Button
              onClick={async () => {
                const persisted = await loadOnboardingDraft(activeProjectId);
                const draft = restartOnboarding(persisted);
                await saveOnboardingDraft(draft);
                useClyStore.getState().setOnboardingRequested("current");
              }}
            >
              <RotateCcw size={14} /> Run guided setup again
            </Button>
            {next ? (
              <Button
                variant="primary"
                onClick={() => setScreen(next.destination)}
              >
                {next.action} <ArrowRight size={14} />
              </Button>
            ) : null}
          </div>
        }
      />

      <section className="cly-help-section" aria-labelledby="setup-checklist">
        <header>
          <div>
            <h2 id="setup-checklist">First evidence chain</h2>
            <p>
              Complete these steps in order. You can return here at any time.
            </p>
          </div>
        </header>
        <ol className="cly-setup-checklist">
          {steps.map((step, index) => (
            <li key={step.id} data-complete={step.complete}>
              {step.complete ? (
                <CheckCircle2 aria-hidden="true" />
              ) : (
                <Circle aria-hidden="true" />
              )}
              <span className="cly-setup-index">{index + 1}</span>
              <div>
                <strong>{step.label}</strong>
                <span>{step.detail}</span>
              </div>
              <span className="cly-setup-state">
                {step.complete ? "Complete" : "Next"}
              </span>
              <Button
                variant="ghost"
                onClick={() => setScreen(step.destination)}
              >
                {step.action}
              </Button>
            </li>
          ))}
        </ol>
      </section>

      <div className="cly-help-columns">
        <section className="cly-help-section" aria-labelledby="help-examples">
          <header>
            <BookOpen aria-hidden="true" />
            <div>
              <h2 id="help-examples">Examples</h2>
              <p>Use an existing project to see a complete workflow.</p>
            </div>
          </header>
          <div className="cly-help-rows">
            <button type="button" onClick={() => setScreen("sources")}>
              <span>
                <strong>Paper to claim</strong>
                <small>Source → claim → experiment → audit</small>
              </span>
              <ArrowRight aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setScreen("notebooks")}>
              <span>
                <strong>Notebook to artifact</strong>
                <small>Notebook → code link → provenance → package</small>
              </span>
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </section>

        <section className="cly-help-section" aria-labelledby="help-recovery">
          <header>
            <LifeBuoy aria-hidden="true" />
            <div>
              <h2 id="help-recovery">Recover work</h2>
              <p>Research records stay local when a provider is unavailable.</p>
            </div>
          </header>
          <div className="cly-help-actions">
            <Button onClick={() => void loadFromApi(activeProjectId)}>
              Retry project load
            </Button>
            <Button onClick={() => setScreen("settings")}>Open settings</Button>
          </div>
          <p className="cly-help-note">
            If a run stopped, open Agent Sessions and resume the interrupted
            task. If an import failed, the import form keeps your entered data.
          </p>
        </section>
      </div>

      <section className="cly-help-section" aria-labelledby="help-find-tools">
        <header>
          <Compass aria-hidden="true" />
          <div>
            <h2 id="help-find-tools">Find any destination</h2>
            <p>
              Advanced integrity, provider, and administration tools stay
              searchable without crowding the primary workflow.
            </p>
          </div>
          <Button onClick={() => setCommandPaletteOpen(true)}>
            <Search size={14} /> Search Cly
          </Button>
        </header>
      </section>
    </div>
  );
}
