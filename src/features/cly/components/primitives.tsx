import { AlertTriangle, Inbox, LoaderCircle, Search, X } from "lucide-react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import type { StatusTone } from "../domain/types";

export function Button({
  children,
  className = "",
  variant = "default",
  iconOnly = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost" | "danger";
  iconOnly?: boolean;
}) {
  return (
    <button
      className={`cly-btn cly-btn-${variant}${iconOnly ? " cly-btn-icon" : ""} ${className}`}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "neutral",
  square = false,
  className = "",
}: {
  children: ReactNode;
  tone?: StatusTone;
  square?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`cly-badge${square ? " cly-badge-square" : ""} ${className}`}
      data-tone={tone}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  kicker,
  actions,
}: {
  title: string;
  description: string;
  kicker?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="cly-page-header">
      <div>
        {kicker ? <div className="cly-page-kicker">{kicker}</div> : null}
        <h1 className="cly-page-title">{title}</h1>
        <p className="cly-page-description">{description}</p>
      </div>
      {actions ? <div className="cly-page-actions">{actions}</div> : null}
    </header>
  );
}

export function Section({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`cly-section ${className}`}>
      <div className="cly-section-heading">
        <div>
          <h2 className="cly-section-title">{title}</h2>
          {subtitle ? <p className="cly-section-subtitle">{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
}) {
  return (
    <div className="cly-metric">
      <div className="cly-metric-label">{label}</div>
      <div className="cly-metric-value">{value}</div>
      {detail ? <div className="cly-metric-detail">{detail}</div> : null}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <fieldset className="cly-segmented" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </fieldset>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search",
  label = "Search",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <label className="cly-global-search cly-search-input">
      <span className="cly-sr-only">{label}</span>
      <Search size={13} aria-hidden="true" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        data-search-input
      />
    </label>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="cly-empty" role="status">
      <div>
        <div className="cly-empty-icon">{icon ?? <Inbox size={18} />}</div>
        <h3>{title}</h3>
        <p>{description}</p>
        {action}
      </div>
    </div>
  );
}

export function LoadingState({
  label = "Loading research objects",
}: {
  label?: string;
}) {
  return (
    <div className="cly-empty" role="status" aria-label={label}>
      <div>
        <div className="cly-empty-icon">
          <LoaderCircle className="animate-spin" size={18} />
        </div>
        <h3>{label}</h3>
        <p>Preparing linked fixture data and project state.</p>
      </div>
    </div>
  );
}

export function ErrorState({
  title = "This view could not be loaded",
  description,
  onRetry,
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <div className="cly-empty" role="alert">
      <div>
        <div className="cly-empty-icon">
          <AlertTriangle size={18} />
        </div>
        <h3>{title}</h3>
        <p>{description}</p>
        {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
      </div>
    </div>
  );
}

export function Toggle({
  pressed,
  onChange,
  label,
}: {
  pressed: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      className="cly-toggle"
      type="button"
      role="switch"
      aria-checked={pressed}
      aria-label={label}
      onClick={() => onChange(!pressed)}
    />
  );
}

export function Dialog({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  wide = false,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="cly-overlay" role="presentation">
      <div
        className={`cly-dialog${wide ? " cly-dialog-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cly-dialog-title"
      >
        <div className="cly-dialog-header">
          <div>
            <h2 className="cly-dialog-title" id="cly-dialog-title">
              {title}
            </h2>
            {description ? (
              <p className="cly-dialog-description">{description}</p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            iconOnly
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={14} />
          </Button>
        </div>
        <div className="cly-dialog-body">{children}</div>
        {footer ? <div className="cly-dialog-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Panel({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`cly-panel ${className}`} {...props}>
      {children}
    </div>
  );
}

export function toneForStatus(status: string): StatusTone {
  const value = status.toLowerCase();
  if (
    [
      "connected",
      "complete",
      "verified",
      "strong",
      "paper-ready",
      "ready",
      "resolved",
      "active",
      "publication-ready",
      "artifact-ready",
      "canonical",
    ].some((item) => value.includes(item))
  )
    return "success";
  if (
    [
      "failed",
      "broken",
      "blocked",
      "unsupported",
      "invalidated",
      "error",
      "not reproducible",
      "at risk",
    ].some((item) => value.includes(item))
  )
    return "danger";
  if (
    [
      "warning",
      "weak",
      "partial",
      "stale",
      "review",
      "required",
      "unresolved",
      "manual",
      "running",
      "assigned",
    ].some((item) => value.includes(item))
  )
    return "warning";
  if (
    ["medium", "planned", "queued", "reading", "suggested", "waiting"].some(
      (item) => value.includes(item),
    )
  )
    return "info";
  return "neutral";
}
