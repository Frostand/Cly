import { Link2, Plus, X } from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ResearchGraph, researchClient } from "../api/research-client";

const EMPTY_GRAPH: ResearchGraph = { objects: [], relationships: [] };

export interface ResearchPanelProps {
  onClosePanel: () => void;
  projectId: string;
}

export function ResearchPanel({ onClosePanel, projectId }: ResearchPanelProps) {
  const [graph, setGraph] = useState<ResearchGraph>(EMPTY_GRAPH);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [claimTitle, setClaimTitle] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [claimId, setClaimId] = useState("");
  const [evidenceQuote, setEvidenceQuote] = useState("");
  const [evidenceLocator, setEvidenceLocator] = useState("");
  const [evidenceType, setEvidenceType] = useState<"supports" | "contradicts">(
    "supports",
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setGraph(await researchClient.list(projectId));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load research objects.",
      );
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const sources = useMemo(
    () => graph.objects.filter((object) => object.type === "source"),
    [graph.objects],
  );
  const claims = useMemo(
    () => graph.objects.filter((object) => object.type === "claim"),
    [graph.objects],
  );

  async function submitSource(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await researchClient.createSource(projectId, {
        title: sourceTitle,
        url: sourceUrl,
      });
      setSourceTitle("");
      setSourceUrl("");
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to add source.",
      );
    }
  }

  async function submitClaim(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await researchClient.createClaim(projectId, { title: claimTitle });
      setClaimTitle("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to add claim.");
    }
  }

  async function submitRelationship(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await researchClient.linkEvidence(projectId, {
        sourceId,
        claimId,
        quote: evidenceQuote,
        locator: evidenceLocator || undefined,
        type: evidenceType,
      });
      setEvidenceQuote("");
      setEvidenceLocator("");
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to link evidence.",
      );
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Research">
      <header className="flex items-center justify-between border-b px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold">Research</h2>
          <p className="text-xs text-muted-foreground">
            Sources, claims, and evidence
          </p>
        </div>
        <Button
          aria-label="Close research panel"
          onClick={onClosePanel}
          size="icon"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
        {error ? (
          <p
            className="rounded border border-destructive/50 p-2 text-xs text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {loading ? (
          <p className="text-sm text-muted-foreground">
            Loading research graph…
          </p>
        ) : null}

        <form className="space-y-2" onSubmit={submitSource}>
          <h3 className="text-sm font-medium">Add source</h3>
          <Label htmlFor="research-source-title">Title</Label>
          <Input
            id="research-source-title"
            onChange={(event) => setSourceTitle(event.target.value)}
            required
            value={sourceTitle}
          />
          <Label htmlFor="research-source-url">URL</Label>
          <Input
            id="research-source-url"
            onChange={(event) => setSourceUrl(event.target.value)}
            required
            type="url"
            value={sourceUrl}
          />
          <Button size="sm" type="submit">
            <Plus className="size-4" />
            Add source
          </Button>
        </form>

        <form className="space-y-2" onSubmit={submitClaim}>
          <h3 className="text-sm font-medium">Record claim</h3>
          <Label htmlFor="research-claim-title">Claim</Label>
          <Input
            id="research-claim-title"
            onChange={(event) => setClaimTitle(event.target.value)}
            required
            value={claimTitle}
          />
          <Button size="sm" type="submit">
            <Plus className="size-4" />
            Add claim
          </Button>
        </form>

        <form className="space-y-2" onSubmit={submitRelationship}>
          <h3 className="text-sm font-medium">Link supporting evidence</h3>
          <Label htmlFor="research-source-link">Source</Label>
          <select
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            id="research-source-link"
            onChange={(event) => setSourceId(event.target.value)}
            required
            value={sourceId}
          >
            <option value="">Select a source</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.title}
              </option>
            ))}
          </select>
          <Label htmlFor="research-claim-link">Claim</Label>
          <select
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            id="research-claim-link"
            onChange={(event) => setClaimId(event.target.value)}
            required
            value={claimId}
          >
            <option value="">Select a claim</option>
            {claims.map((claim) => (
              <option key={claim.id} value={claim.id}>
                {claim.title}
              </option>
            ))}
          </select>
          <Label htmlFor="research-evidence-quote">Exact passage</Label>
          <textarea
            className="min-h-20 w-full rounded-md border bg-background p-2 text-sm"
            id="research-evidence-quote"
            onChange={(event) => setEvidenceQuote(event.target.value)}
            required
            value={evidenceQuote}
          />
          <Label htmlFor="research-evidence-locator">Page or locator</Label>
          <Input
            id="research-evidence-locator"
            onChange={(event) => setEvidenceLocator(event.target.value)}
            placeholder="e.g. p. 14, Results §3.2"
            value={evidenceLocator}
          />
          <Label htmlFor="research-evidence-type">Relationship</Label>
          <select
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            id="research-evidence-type"
            onChange={(event) =>
              setEvidenceType(event.target.value as "supports" | "contradicts")
            }
            value={evidenceType}
          >
            <option value="supports">Supports claim</option>
            <option value="contradicts">Contradicts claim</option>
          </select>
          <Button
            disabled={!sourceId || !claimId || !evidenceQuote.trim()}
            size="sm"
            type="submit"
          >
            <Link2 className="size-4" />
            Link evidence
          </Button>
        </form>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Research graph</h3>
          {!loading && graph.objects.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Add a source and a claim to begin.
            </p>
          ) : null}
          {graph.relationships
            .filter(
              (relationship) =>
                relationship.type === "supports" ||
                relationship.type === "contradicts",
            )
            .map((relationship) => {
              const source = graph.objects.find(
                (object) => object.id === relationship.fromObjectId,
              );
              const claim = graph.objects.find(
                (object) => object.id === relationship.toObjectId,
              );
              return (
                <p className="rounded border p-2 text-xs" key={relationship.id}>
                  <strong>{source?.title ?? "Evidence passage"}</strong>{" "}
                  {relationship.type} <strong>{claim?.title ?? "Claim"}</strong>
                </p>
              );
            })}
        </div>
      </div>
    </section>
  );
}
