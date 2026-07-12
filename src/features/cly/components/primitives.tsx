import * as RadixDialog from "@radix-ui/react-dialog";
import * as RadixToggleGroup from "@radix-ui/react-toggle-group";
import { AlertTriangle, Inbox, LoaderCircle, Search, X } from "lucide-react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import type { StatusTone } from "../domain/types";
import {
  SkeletonRows,
  StatusIndicator,
  WorkspaceHeader,
} from "./design-system";

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
    <StatusIndicator
      className={`cly-badge${square ? " cly-badge-square" : ""} ${className}`}
      tone={tone}
      emphasis={tone === "warning" || tone === "danger"}
    >
      {children}
    </StatusIndicator>
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
    <WorkspaceHeader
      title={title}
      eyebrow={kicker}
      description={description}
      actions={actions}
    />
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
    <RadixToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next as T);
      }}
      className="cly-segmented"
      aria-label={label}
    >
      {options.map((option) => (
        <RadixToggleGroup.Item key={option} value={option}>
          {option}
        </RadixToggleGroup.Item>
      ))}
    </RadixToggleGroup.Root>
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
    <div className="cly-loading-state" role="status" aria-label={label}>
      <div className="cly-loading-label">
        <LoaderCircle className="animate-spin" size={13} />
        <span>{label}</span>
      </div>
      <SkeletonRows count={7} />
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
  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="cly-overlay" />
        <RadixDialog.Content
          className={`cly-dialog${wide ? " cly-dialog-wide" : ""}`}
          onOpenAutoFocus={(event) => {
            const content = event.currentTarget as HTMLElement | null;
            const target = content?.querySelector<HTMLElement>(
              "[autofocus], input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
            );
            if (target) {
              event.preventDefault();
              target.focus();
            }
          }}
        >
          <div className="cly-dialog-header">
            <div>
              <RadixDialog.Title className="cly-dialog-title">
                {title}
              </RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="cly-dialog-description">
                  {description}
                </RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="cly-sr-only">
                  {title} dialog
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close asChild>
              <Button variant="ghost" iconOnly aria-label="Close dialog">
                <X size={14} />
              </Button>
            </RadixDialog.Close>
          </div>
          <div className="cly-dialog-body">{children}</div>
          {footer ? <div className="cly-dialog-footer">{footer}</div> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function Panel({
  children,
  className = "",
  variant = "group",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: "group" | "workspace" | "raised" | "selected";
}) {
  return (
    <div className={`cly-panel ${className}`} data-variant={variant} {...props}>
      {children}
    </div>
  );
}

export function toneForStatus(status: string): StatusTone {
  const value = status.toLowerCase();
  if (value === "blocking" || value === "high") return "danger";
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
