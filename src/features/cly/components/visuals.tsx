import { ArrowRight, Check, CircleAlert } from "lucide-react";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
} from "motion/react";
import { type ReactNode, useId } from "react";
import { clyMotion, reducedFade } from "../design-system/motion";

export function ClyMotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={clyMotion.small}>
      {children}
    </MotionConfig>
  );
}

export function RouteTransition({
  route,
  children,
}: {
  route: string;
  children: ReactNode;
}) {
  const useFallback =
    typeof navigator !== "undefined" && navigator.userAgent.includes("jsdom");
  const reduced = useReducedMotion();
  const states = reduced
    ? reducedFade
    : {
        initial: { opacity: 0, y: 5 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -3 },
      };
  if (useFallback) {
    return <div className="cly-route-transition">{children}</div>;
  }
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        className="cly-route-transition"
        key={route}
        initial={states.initial}
        animate={states.animate}
        exit={states.exit}
        transition={reduced ? clyMotion.immediate : clyMotion.panel}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function Sparkline({
  values,
  label,
  tone = "accent",
}: {
  values: number[];
  label: string;
  tone?: "accent" | "success" | "warning" | "danger";
}) {
  const reduced = useReducedMotion();
  const titleId = useId();
  const width = 120;
  const height = 30;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = values.map((value, index) => ({
    x: values.length === 1 ? width / 2 : (index / (values.length - 1)) * width,
    y: height - 3 - ((value - min) / range) * (height - 7),
  }));
  const path = points
    .map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`)
    .join(" ");
  return (
    <svg
      className="cly-sparkline"
      data-tone={tone}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-labelledby={titleId}
    >
      <title id={titleId}>{`${label}: ${values.join(", ")}`}</title>
      <motion.path
        d={path}
        fill="none"
        pathLength={1}
        initial={reduced ? false : { pathLength: 0, opacity: 0.45 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={clyMotion.structural}
      />
      {points.map((point, index) => (
        <circle
          key={`${point.x}-${point.y}`}
          cx={point.x}
          cy={point.y}
          r={index === points.length - 1 ? 2.2 : 1.2}
        />
      ))}
    </svg>
  );
}

export function VisualMetric({
  label,
  value,
  detail,
  values,
  tone = "accent",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  values?: number[];
  tone?: "accent" | "success" | "warning" | "danger";
}) {
  return (
    <div className="cly-visual-metric" data-tone={tone}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {detail ? <small>{detail}</small> : null}
      </div>
      {values?.length ? (
        <Sparkline values={values} label={label} tone={tone} />
      ) : null}
    </div>
  );
}

export function ResearchLifecycle({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  const reduced = useReducedMotion();
  const normalized = Math.min(steps.length - 1, Math.max(0, current));
  const progress =
    steps.length < 2 ? 0 : (normalized / (steps.length - 1)) * 100;
  return (
    <section className="cly-lifecycle" aria-label="Research lifecycle">
      <div className="cly-lifecycle-track" aria-hidden="true">
        <motion.i
          initial={false}
          animate={{ width: `${progress}%` }}
          transition={reduced ? clyMotion.immediate : clyMotion.structural}
        />
      </div>
      <ol>
        {steps.map((step, index) => (
          <li
            key={step}
            data-state={
              index < normalized
                ? "complete"
                : index === normalized
                  ? "active"
                  : "future"
            }
            aria-current={index === normalized ? "step" : undefined}
          >
            <span>{index < normalized ? <Check size={11} /> : index + 1}</span>
            <strong>{step}</strong>
          </li>
        ))}
      </ol>
    </section>
  );
}

export type BudgetSegment = {
  label: string;
  value: number;
  tone?: "accent" | "info" | "success" | "warning" | "danger";
};

export function TokenBudgetBar({
  segments,
  capacity,
  label = "Context budget",
}: {
  segments: BudgetSegment[];
  capacity: number;
  label?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const ratio = Math.min(1, total / Math.max(1, capacity));
  return (
    <div
      className="cly-token-budget"
      role="img"
      aria-label={`${label}: ${total} of ${capacity} tokens`}
    >
      <div className="cly-token-budget-heading">
        <strong>{Math.round(ratio * 100)}% used</strong>
        <span>{(capacity - total).toLocaleString()} remaining</span>
      </div>
      <div className="cly-token-budget-track">
        {segments.map((segment) => (
          <motion.i
            key={segment.label}
            data-tone={segment.tone ?? "accent"}
            title={`${segment.label}: ${segment.value.toLocaleString()} tokens`}
            initial={false}
            animate={{
              width: `${(segment.value / Math.max(1, capacity)) * 100}%`,
            }}
            transition={clyMotion.small}
          />
        ))}
      </div>
      <div className="cly-token-budget-legend">
        {segments.slice(0, 5).map((segment) => (
          <span key={segment.label} data-tone={segment.tone ?? "accent"}>
            <i /> {segment.label}{" "}
            <small>
              {Math.round((segment.value / Math.max(1, total)) * 100)}%
            </small>
          </span>
        ))}
      </div>
    </div>
  );
}

export function EvidenceStrength({
  confidence,
  support,
  contradictions,
  label = "Evidence strength",
}: {
  confidence: number;
  support: number;
  contradictions: number;
  label?: string;
}) {
  return (
    <div
      className="cly-evidence-strength"
      role="img"
      aria-label={`${label}: ${confidence}% confidence, ${support} supporting, ${contradictions} contradicting`}
    >
      <div>
        <span>{label}</span>
        <strong>{confidence}%</strong>
      </div>
      <div className="cly-evidence-strength-track" aria-hidden="true">
        <i data-tone="support" style={{ width: `${confidence}%` }} />
        <i
          data-tone="conflict"
          style={{
            width: `${Math.min(100 - confidence, contradictions * 8)}%`,
          }}
        />
      </div>
      <small>
        {support} supporting · {contradictions} contradicting
      </small>
    </div>
  );
}

export function ExecutionStrip({
  cells,
  label = "Notebook execution structure",
}: {
  cells: Array<"markdown" | "code" | "output" | "error">;
  label?: string;
}) {
  const counts = cells.reduce<Record<string, number>>((result, cell) => {
    result[cell] = (result[cell] ?? 0) + 1;
    return result;
  }, {});
  const occurrences: Record<string, number> = {};
  const keyedCells = cells.map((cell) => {
    occurrences[cell] = (occurrences[cell] ?? 0) + 1;
    return { cell, id: `${cell}-${occurrences[cell]}` };
  });
  return (
    <div
      className="cly-execution-strip"
      role="img"
      aria-label={`${label}: ${Object.entries(counts)
        .map(([kind, count]) => `${count} ${kind}`)
        .join(", ")}`}
    >
      {keyedCells.map(({ cell, id }, index) => (
        <i key={id} data-kind={cell} title={`${index + 1}: ${cell}`} />
      ))}
    </div>
  );
}

export function RiskDistribution({
  values,
}: {
  values: Array<{
    label: string;
    value: number;
    tone: "success" | "warning" | "danger" | "neutral";
  }>;
}) {
  const total = Math.max(
    1,
    values.reduce((sum, item) => sum + item.value, 0),
  );
  return (
    <div
      className="cly-risk-distribution"
      role="img"
      aria-label={values
        .map((item) => `${item.label}: ${item.value}`)
        .join(", ")}
    >
      <div className="cly-risk-distribution-track">
        {values.map((item) => (
          <i
            key={item.label}
            data-tone={item.tone}
            style={{ width: `${(item.value / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="cly-risk-distribution-legend">
        {values.map((item) => (
          <span key={item.label} data-tone={item.tone}>
            <i /> {item.label} <strong>{item.value}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

export function RelationshipChain({
  steps,
  label,
  alertAt,
}: {
  steps: Array<{ label: string; detail?: string }>;
  label: string;
  alertAt?: number;
}) {
  return (
    <ol className="cly-relationship-chain" aria-label={label}>
      {steps.map((step, index) => (
        <li key={step.label} data-alert={index === alertAt}>
          <span>
            {index === alertAt ? <CircleAlert size={12} /> : index + 1}
          </span>
          <div>
            <strong>{step.label}</strong>
            {step.detail ? <small>{step.detail}</small> : null}
          </div>
          {index < steps.length - 1 ? (
            <ArrowRight size={13} aria-hidden="true" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function ImpactEffortMap({
  items,
}: {
  items: Array<{
    id: string;
    label: string;
    impact: "High" | "Medium" | "Low";
    effort: "Small" | "Medium" | "Large";
    status: string;
  }>;
}) {
  const impactPosition = { Low: 18, Medium: 52, High: 86 };
  const effortPosition = { Small: 14, Medium: 50, Large: 86 };
  return (
    <div
      className="cly-impact-effort"
      role="img"
      aria-label={items
        .map(
          (item) =>
            `${item.label}: ${item.impact} impact, ${item.effort} effort, ${item.status}`,
        )
        .join("; ")}
    >
      <span className="cly-impact-effort-y">Impact</span>
      <span className="cly-impact-effort-x">Effort</span>
      <i className="cly-impact-effort-v" />
      <i className="cly-impact-effort-h" />
      {items.slice(0, 12).map((item, index) => (
        <span
          className="cly-impact-effort-dot"
          key={item.id}
          data-status={item.status}
          title={`${item.label}: ${item.impact} impact / ${item.effort} effort`}
          style={{
            left: `${effortPosition[item.effort] + (index % 3) * 2 - 2}%`,
            bottom: `${impactPosition[item.impact] + (index % 2) * 2 - 1}%`,
          }}
        />
      ))}
    </div>
  );
}
