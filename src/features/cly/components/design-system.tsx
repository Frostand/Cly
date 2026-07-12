import { ChevronDown, Search } from "lucide-react";
import {
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type UIEvent,
  useState,
} from "react";
import type { StatusTone } from "../domain/types";

export function WorkspaceHeader({
  title,
  eyebrow,
  description,
  metadata,
  actions,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  metadata?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="cly-workspace-header">
      <div className="cly-workspace-heading">
        {eyebrow ? <span>{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {metadata ? <InlineMetadata>{metadata}</InlineMetadata> : null}
      </div>
      {actions ? <div className="cly-workspace-actions">{actions}</div> : null}
    </header>
  );
}

export function PaneHeader({
  title,
  detail,
  actions,
  className = "",
}: {
  title: ReactNode;
  detail?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`cly-pane-header ${className}`}>
      <div>
        <strong>{title}</strong>
        {detail ? <span>{detail}</span> : null}
      </div>
      {actions ? <div className="cly-pane-actions">{actions}</div> : null}
    </header>
  );
}

export function Toolbar({
  children,
  label,
  className = "",
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`cly-toolbar ${className}`}
      role="toolbar"
      aria-label={label}
    >
      {children}
    </div>
  );
}

export function InlineMetadata({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`cly-inline-metadata ${className}`}>{children}</div>;
}

export function StatusIndicator({
  children,
  tone = "neutral",
  emphasis = false,
  className = "",
}: {
  children: ReactNode;
  tone?: StatusTone;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`cly-status-indicator ${className}`}
      data-tone={tone}
      data-emphasis={emphasis}
    >
      <i aria-hidden="true" />
      {children}
    </span>
  );
}

export function RiskIndicator({
  level,
  children,
}: {
  level: "low" | "medium" | "high" | "blocking";
  children?: ReactNode;
}) {
  const tone =
    level === "low" ? "success" : level === "medium" ? "warning" : "danger";
  return (
    <StatusIndicator tone={tone} emphasis={level === "blocking"}>
      {children ?? `${level.charAt(0).toUpperCase()}${level.slice(1)} risk`}
    </StatusIndicator>
  );
}

export function ProgressIndicator({
  value,
  label,
  compact = false,
}: {
  value: number;
  label?: string;
  compact?: boolean;
}) {
  const normalized = Math.min(100, Math.max(0, value));
  return (
    <div className="cly-progress-indicator" data-compact={compact}>
      {label ? <span>{label}</span> : null}
      <div
        role="progressbar"
        aria-label={label ?? "Progress"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={normalized}
      >
        <i style={{ width: `${normalized}%` }} />
      </div>
      <strong>{normalized}%</strong>
    </div>
  );
}

export function DisclosureRow({
  title,
  detail,
  metadata,
  children,
  defaultOpen = false,
  tone,
}: {
  title: ReactNode;
  detail?: ReactNode;
  metadata?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  tone?: StatusTone;
}) {
  return (
    <details className="cly-disclosure-row" open={defaultOpen} data-tone={tone}>
      <summary>
        <ChevronDown size={13} aria-hidden="true" />
        <span>
          <strong>{title}</strong>
          {detail ? <small>{detail}</small> : null}
        </span>
        {metadata ? <InlineMetadata>{metadata}</InlineMetadata> : null}
      </summary>
      <div className="cly-disclosure-content">{children}</div>
    </details>
  );
}

export function SplitPane({
  primary,
  secondary,
  secondaryWidth = 36,
  label = "Resize panes",
  min = 24,
  max = 58,
  onWidthChange,
  className = "",
}: {
  primary: ReactNode;
  secondary: ReactNode;
  secondaryWidth?: number;
  label?: string;
  min?: number;
  max?: number;
  onWidthChange?: (width: number) => void;
  className?: string;
}) {
  const [internalWidth, setInternalWidth] = useState(secondaryWidth);
  const width = onWidthChange ? secondaryWidth : internalWidth;
  const setWidth = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next));
    if (onWidthChange) onWidthChange(clamped);
    else setInternalWidth(clamped);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLHRElement>) => {
    if (event.key === "ArrowLeft") setWidth(width + 2);
    if (event.key === "ArrowRight") setWidth(width - 2);
  };
  return (
    <div
      className={`cly-split-pane ${className}`}
      style={{ "--cly-split-secondary": `${width}%` } as React.CSSProperties}
    >
      <div className="cly-split-primary">{primary}</div>
      <hr
        className="cly-split-separator"
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={width}
        tabIndex={0}
        onKeyDown={onKeyDown}
      />
      <div className="cly-split-secondary">{secondary}</div>
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  label = "Search",
  placeholder = "Search",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}) {
  return (
    <label className="cly-search-field">
      <span className="cly-sr-only">{label}</span>
      <Search size={13} aria-hidden="true" />
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

const skeletonRowIds = [
  "alpha",
  "bravo",
  "charlie",
  "delta",
  "echo",
  "foxtrot",
  "golf",
  "hotel",
  "india",
  "juliet",
  "kilo",
  "lima",
];

export function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <div className="cly-skeleton-rows" role="status" aria-label="Loading rows">
      {skeletonRowIds.slice(0, count).map((id) => (
        <div key={id}>
          <i />
          <span />
          <small />
        </div>
      ))}
    </div>
  );
}

export function OutlineView({
  children,
  label,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  label: string;
}) {
  return (
    <div
      className={`cly-outline-view ${className}`}
      role="tree"
      aria-label={label}
      {...props}
    >
      {children}
    </div>
  );
}

export function VirtualizedList<T>({
  items,
  height,
  rowHeight,
  renderItem,
  getKey,
  label,
  className = "",
  overscan = 4,
}: {
  items: readonly T[];
  height: number;
  rowHeight: number;
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T) => string;
  label: string;
  className?: string;
  overscan?: number;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const visibleCount = Math.ceil(height / rowHeight);
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(items.length, start + visibleCount + overscan * 2);
  const before = start * rowHeight;
  const after = Math.max(0, (items.length - end) * rowHeight);
  const handleScroll = (event: UIEvent<HTMLUListElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  };

  return (
    <ul
      className={`cly-virtualized-list ${className}`}
      aria-label={label}
      onScroll={handleScroll}
      style={
        {
          "--cly-virtual-height": `${height}px`,
          paddingBlockStart: before,
          paddingBlockEnd: after,
        } as CSSProperties
      }
    >
      {items.slice(start, end).map((item, offset) => {
        const index = start + offset;
        return (
          <li key={getKey(item)} style={{ minHeight: rowHeight }}>
            {renderItem(item, index)}
          </li>
        );
      })}
    </ul>
  );
}
