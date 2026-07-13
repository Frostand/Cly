import { ShieldAlert } from "lucide-react";
import type { InheritedRestriction } from "../domain/obligations";
import { Badge, Button } from "./primitives";

export function InheritedRestrictions({
  restrictions,
  compact = false,
  onOpen,
}: {
  restrictions: InheritedRestriction[];
  compact?: boolean;
  onOpen?: () => void;
}) {
  if (restrictions.length === 0) return null;
  return (
    <div className="cly-callout" data-tone="warning">
      <div className="cly-row-between">
        <div className="cly-row">
          <ShieldAlert size={14} aria-hidden="true" />
          <strong>Inherited data restrictions</strong>
        </div>
        <Badge tone="warning">{restrictions.length}</Badge>
      </div>
      {restrictions.map((restriction) => (
        <div className="cly-small" key={restriction.obligationId}>
          <strong>{restriction.datasetTitle}</strong>
          <div className="cly-muted">
            {restriction.externalProcessing === "blocked"
              ? "External processing blocked"
              : restriction.externalProcessing === "review"
                ? "External processing requires review"
                : "External processing allowed"}
            {` · ${restriction.license} · owner ${restriction.owner}`}
          </div>
          {!compact ? (
            <div className="cly-muted">{restriction.consentProtocolScope}</div>
          ) : null}
        </div>
      ))}
      {onOpen ? (
        <Button variant="ghost" onClick={onOpen}>
          Review obligations
        </Button>
      ) : null}
    </div>
  );
}
