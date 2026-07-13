import { createHash } from "node:crypto";
import { toHtml } from "hast-util-to-html";
import { z } from "zod";

const claimSelectionSchema = z
  .array(z.string().trim().min(1).max(200))
  .min(1)
  .max(25)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    "Claim IDs must be unique.",
  );

const CONTENT_SECURITY_POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

const privatePathPattern =
  /(?:^|[\s("'=])(?:\/(?:Users|home|private|var|tmp|etc|Volumes)\/[^\s<>"']+|[A-Za-z]:\\[^\s<>"']+)/gi;
const secretPattern =
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|secret|token)\s*[:=]\s*[^\s,;]+|\bBearer\s+[^\s,;]+|\b(?:ghp|sk|rk)_[A-Za-z0-9_-]{12,}\b/gi;
const excludedAreaPattern =
  /(?:^|\W)(\.env(?:\.[A-Za-z0-9_-]+)?|\.git|node_modules|chat(?:\s+logs?)?|provider configuration|providers?\/(?:config|credentials))\b/gi;
const remoteUrlPattern = /\b(?:https?|file|javascript):\/\/[^\s<>"']+/gi;

const capsuleStyle = `
  :root { color-scheme: light; font-family: ui-sans-serif, system-ui, sans-serif; color: #202124; background: #fff; }
  body { max-width: 980px; margin: 0 auto; padding: 36px 24px 72px; line-height: 1.5; }
  header { border-bottom: 2px solid #4c1d95; margin-bottom: 28px; padding-bottom: 16px; }
  h1 { margin: 0; font-size: 1.7rem; } h2 { margin-top: 32px; font-size: 1.2rem; }
  h3 { margin: 0 0 4px; font-size: 1rem; } p { margin: 4px 0 12px; }
  .meta, .muted { color: #5f6368; font-size: .9rem; } .record { border-left: 3px solid #ddd6fe; margin: 12px 0; padding: 10px 14px; }
  .tag { display: inline-block; margin: 3px 6px 0 0; padding: 1px 7px; border: 1px solid #d1d5db; border-radius: 999px; font-size: .78rem; }
  .tag[data-status="contradiction"], .tag[data-status="unverifiable"] { border-color: #dc2626; color: #991b1b; }
  .tag[data-status="reproducible"], .tag[data-status="verified"] { border-color: #15803d; color: #166534; }
  table { border-collapse: collapse; width: 100%; font-size: .88rem; } th, td { border: 1px solid #d1d5db; padding: 7px; text-align: left; vertical-align: top; }
  th { background: #f5f3ff; } code { font-family: ui-monospace, monospace; word-break: break-all; }
  @media print { body { padding: 0; } .record { break-inside: avoid; } }
`;

const text = (value) => ({ type: "text", value: String(value ?? "") });
const element = (tagName, properties = {}, children = []) => ({
  type: "element",
  tagName,
  properties,
  children,
});

const section = (title, children) =>
  element("section", {}, [element("h2", {}, [text(title)]), ...children]);

const tag = (value, status) =>
  element("span", { className: ["tag"], dataStatus: status }, [text(value)]);

function redactText(value) {
  return String(value ?? "")
    .replace(remoteUrlPattern, "[external reference removed]")
    .replace(privatePathPattern, (match) => {
      const prefix = /^[\s("'=]/.test(match) ? match[0] : "";
      return `${prefix}[private path removed]`;
    })
    .replace(secretPattern, "[credential removed]")
    .replace(excludedAreaPattern, (match) => {
      const prefix = /^\W/.test(match) ? match[0] : "";
      return `${prefix}[excluded area removed]`;
    });
}

const safeText = (value) => redactText(value).trim();

function currentnessFor(object) {
  if (object.type === "source" && object.payload?.status === "placeholder") {
    return "stale";
  }
  if (object.type === "artifact" && !object.payload?.sha256) return "stale";
  if (object.type === "run" && object.payload?.status !== "completed") {
    return "stale";
  }
  return "current";
}

function verificationFor(record) {
  if (record.origin === "inferred") return "inferred";
  if (record.reviewState === "rejected") return "inferred";
  return "verified";
}

function reproducibilityFor(object) {
  if (object.type === "claim") {
    if (object.payload?.reproducibilityStatus === "passed")
      return "reproducible";
    if (object.payload?.reproducibilityStatus === "not-assessed") {
      return "documented-only";
    }
    return "unverifiable";
  }
  if (
    object.type === "run" &&
    object.payload?.status === "completed" &&
    object.payload?.commitSha
  ) {
    return "documented-only";
  }
  if (object.type === "artifact" && object.payload?.sha256) {
    return "documented-only";
  }
  return "unverifiable";
}

function manifestRecord(object) {
  return {
    id: object.id,
    kind: object.type,
    title: safeText(object.title),
    currentness: currentnessFor(object),
    verification: verificationFor(object),
    reproducibility: reproducibilityFor(object),
  };
}

function relationshipRecord(relationship) {
  return {
    id: relationship.id,
    kind: "relationship",
    title: relationship.type,
    currentness: relationship.reviewState === "rejected" ? "stale" : "current",
    verification: verificationFor(relationship),
    reproducibility: "documented-only",
  };
}

function relevantGraph(graph, claimIds) {
  const objectsById = new Map(
    graph.objects.map((object) => [object.id, object]),
  );
  const includedObjectIds = new Set(claimIds);
  const includedRelationshipIds = new Set();
  const directEvidence = graph.relationships.filter(
    (relationship) =>
      claimIds.includes(relationship.toObjectId) &&
      ["supports", "contradicts", "tests"].includes(relationship.type),
  );

  for (const relationship of directEvidence) {
    includedRelationshipIds.add(relationship.id);
    includedObjectIds.add(relationship.fromObjectId);
  }

  // Include the provenance-carrying upstream chain (run, artifact, code/data)
  // without broadening selection to unrelated claims.
  for (let depth = 0; depth < 3; depth += 1) {
    let changed = false;
    for (const relationship of graph.relationships) {
      if (
        !includedObjectIds.has(relationship.toObjectId) ||
        !["generated-by", "uses", "implements"].includes(relationship.type)
      ) {
        continue;
      }
      const upstream = objectsById.get(relationship.fromObjectId);
      if (
        !upstream ||
        (upstream.type === "claim" && !claimIds.includes(upstream.id))
      ) {
        continue;
      }
      includedRelationshipIds.add(relationship.id);
      if (!includedObjectIds.has(upstream.id)) {
        includedObjectIds.add(upstream.id);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return {
    objects: graph.objects.filter((object) => includedObjectIds.has(object.id)),
    relationships: graph.relationships.filter((relationship) =>
      includedRelationshipIds.has(relationship.id),
    ),
  };
}

function objectDetails(object) {
  const details = [];
  if (object.type === "source") {
    if (object.payload?.citation)
      details.push(`Citation: ${safeText(object.payload.citation)}`);
    if (Array.isArray(object.payload?.authors)) {
      details.push(`Authors: ${safeText(object.payload.authors.join(", "))}`);
    }
    if (Array.isArray(object.payload?.findings)) {
      details.push(`Findings: ${safeText(object.payload.findings.join("; "))}`);
    }
    if (Array.isArray(object.payload?.limitations)) {
      details.push(
        `Limitations: ${safeText(object.payload.limitations.join("; "))}`,
      );
    }
  }
  if (object.type === "experiment" && object.payload?.hypothesis) {
    details.push(`Hypothesis: ${safeText(object.payload.hypothesis)}`);
  }
  if (object.type === "run") {
    details.push(
      `Run status: ${safeText(object.payload?.status ?? "unknown")}`,
    );
    if (object.payload?.commitSha)
      details.push(`Commit: ${safeText(object.payload.commitSha)}`);
  }
  if (object.type === "artifact") {
    if (object.payload?.mediaType)
      details.push(`Media type: ${safeText(object.payload.mediaType)}`);
    if (object.payload?.sha256)
      details.push(`SHA-256: ${safeText(object.payload.sha256)}`);
  }
  return details;
}

function recordView(object) {
  const record = manifestRecord(object);
  return element("article", { className: ["record"] }, [
    element("h3", {}, [text(record.title)]),
    element("div", { className: ["meta"] }, [
      text(`${object.type} · ${object.id}`),
    ]),
    ...(safeText(object.description)
      ? [element("p", {}, [text(safeText(object.description))])]
      : []),
    element("div", {}, [
      tag(record.currentness, record.currentness),
      tag(record.verification, record.verification),
      tag(record.reproducibility, record.reproducibility),
    ]),
    ...objectDetails(object).map((detail) =>
      element("p", { className: ["muted"] }, [text(detail)]),
    ),
  ]);
}

function table(headers, rows) {
  return element("table", {}, [
    element("thead", {}, [
      element(
        "tr",
        {},
        headers.map((header) => element("th", {}, [text(header)])),
      ),
    ]),
    element(
      "tbody",
      {},
      rows.map((row) =>
        element(
          "tr",
          {},
          row.map((cell) => element("td", {}, [text(cell)])),
        ),
      ),
    ),
  ]);
}

/** Throws if the exact generated bytes could load code, a remote asset, or private data. */
export function assertSafeSerializedCapsule(html) {
  const findings = [];
  if (/<script\b|\son[a-z]+\s*=|<iframe\b|<object\b/i.test(html)) {
    findings.push("executable markup");
  }
  if (
    /\b(?:src|href)\s*=\s*["']?\s*(?:https?:|file:|javascript:)/i.test(html)
  ) {
    findings.push("remote or executable URL");
  }
  if (
    /\/(?:Users|home|private|var|tmp|etc|Volumes)\//i.test(html) ||
    /[A-Za-z]:\\/.test(html)
  ) {
    findings.push("absolute private path");
  }
  if (secretPattern.test(html) || /\bBearer\s+[A-Za-z0-9._-]+/i.test(html)) {
    findings.push("credential-like content");
  }
  if (excludedAreaPattern.test(html)) findings.push("excluded project area");
  secretPattern.lastIndex = 0;
  excludedAreaPattern.lastIndex = 0;
  if (findings.length > 0) {
    throw new Error(
      `Reviewer capsule safety scan failed: ${findings.join(", ")}.`,
    );
  }
}

function renderCapsule({ generatedAt, graph, manifest, provenance, project }) {
  const objectById = new Map(
    graph.objects.map((object) => [object.id, object]),
  );
  const evidenceRows = graph.relationships.map((relationship) => [
    relationship.type,
    safeText(
      objectById.get(relationship.fromObjectId)?.title ??
        relationship.fromObjectId,
    ),
    safeText(
      objectById.get(relationship.toObjectId)?.title ?? relationship.toObjectId,
    ),
    relationship.reviewState,
    relationship.confidence ?? "not scored",
  ]);
  const provenanceRows = provenance.map((event) => [
    event.sequence ?? "legacy",
    event.createdAt,
    event.action,
    event.detail ?? "",
    event.actorType,
    event.eventHash ?? "unchained",
  ]);
  const manifestRows = [
    ...manifest.included.map((record) => [
      "included",
      record.kind,
      record.id,
      record.currentness,
      record.verification,
      record.reproducibility,
      "",
    ]),
    ...manifest.omitted.map((record) => [
      "omitted",
      record.kind,
      record.id,
      "",
      "",
      "",
      record.reason,
    ]),
  ];
  const tree = {
    type: "root",
    children: [
      { type: "doctype", name: "html" },
      element("html", { lang: "en" }, [
        element("head", {}, [
          element("meta", { charSet: "utf-8" }),
          element("meta", {
            httpEquiv: "Content-Security-Policy",
            content: CONTENT_SECURITY_POLICY,
          }),
          element("meta", { name: "referrer", content: "no-referrer" }),
          element("meta", {
            name: "viewport",
            content: "width=device-width, initial-scale=1",
          }),
          element("title", {}, [text("Cly reviewer capsule")]),
          element("style", {}, [text(capsuleStyle)]),
        ]),
        element("body", {}, [
          element("header", {}, [
            element("h1", {}, [text("Reviewer capsule")]),
            element("p", { className: ["meta"] }, [
              text(
                `Project: ${safeText(project.name)} · Generated: ${generatedAt}`,
              ),
            ]),
            element("p", { className: ["muted"] }, [
              text(
                "Read-only offline record. No account, repository checkout, network request, or local dependency is required.",
              ),
            ]),
          ]),
          section(
            "Selected claims and evidence",
            graph.objects.map(recordView),
          ),
          section("Evidence relationships", [
            table(
              ["Relationship", "From", "To", "Review", "Confidence"],
              evidenceRows,
            ),
          ]),
          section("Relevant provenance and decision history", [
            table(
              [
                "Sequence",
                "Time",
                "Action",
                "Decision detail",
                "Actor type",
                "Event hash",
              ],
              provenanceRows,
            ),
          ]),
          section("Export manifest", [
            element("p", { className: ["muted"] }, [
              text(
                "Included records are rendered above. Omitted records remain in the local project and are listed with their exclusion reason.",
              ),
            ]),
            table(
              [
                "Disposition",
                "Kind",
                "ID",
                "Currentness",
                "Verification",
                "Reproducibility",
                "Reason",
              ],
              manifestRows,
            ),
          ]),
        ]),
      ]),
    ],
  };
  return toHtml(tree, { allowParseErrors: false });
}

export function createReviewerCapsuleService(
  repository,
  { now = () => new Date().toISOString() } = {},
) {
  const preview = (projectId, inputClaimIds) => {
    const claimIds = claimSelectionSchema.parse(inputClaimIds).sort();
    const project = repository.getProject(projectId);
    const canonicalGraph = repository.listProject(projectId);
    const projectObjects = canonicalGraph.objects.filter(
      (object) => object.projectId === projectId,
    );
    const projectRelationships = canonicalGraph.relationships.filter(
      (relationship) => relationship.projectId === projectId,
    );
    const objectsById = new Map(
      projectObjects.map((object) => [object.id, object]),
    );
    for (const claimId of claimIds) {
      const claim = objectsById.get(claimId);
      if (!claim || claim.type !== "claim") {
        throw new Error("Selected claim does not belong to the project.");
      }
    }
    const graph = relevantGraph(
      { objects: projectObjects, relationships: projectRelationships },
      claimIds,
    );
    const includedObjectIds = new Set(graph.objects.map((object) => object.id));
    const includedRelationshipIds = new Set(
      graph.relationships.map((relationship) => relationship.id),
    );
    const manifest = {
      version: 1,
      generatedAt: now(),
      selectedClaimIds: claimIds,
      included: [
        ...graph.objects.map(manifestRecord),
        ...graph.relationships.map(relationshipRecord),
      ].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)),
      omitted: [
        ...projectObjects
          .filter((object) => !includedObjectIds.has(object.id))
          .map((object) => ({
            id: object.id,
            kind: object.type,
            reason:
              object.type === "claim"
                ? "not-selected"
                : "outside-claim-neighborhood",
          })),
        ...projectRelationships
          .filter(
            (relationship) => !includedRelationshipIds.has(relationship.id),
          )
          .map((relationship) => ({
            id: relationship.id,
            kind: "relationship",
            reason: "outside-claim-neighborhood",
          })),
      ].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)),
    };
    const relevantProvenance = repository
      .listProvenance(projectId)
      .filter(
        (event) =>
          (event.objectId && includedObjectIds.has(event.objectId)) ||
          (typeof event.metadata?.relationshipId === "string" &&
            includedRelationshipIds.has(event.metadata.relationshipId)),
      )
      .map((event) => ({
        action: safeText(event.action),
        actorType: event.actorType,
        createdAt: event.createdAt,
        detail: safeText(
          event.metadata?.decision ??
            event.metadata?.reason ??
            event.metadata?.rationale ??
            event.metadata?.to ??
            event.metadata?.reviewState ??
            "",
        ),
        eventHash: event.eventHash ?? null,
        sequence: event.sequence ?? null,
      }));
    const base = {
      generatedAt: manifest.generatedAt,
      graph,
      manifest,
      project,
      provenance: relevantProvenance,
    };
    const html = renderCapsule(base);
    assertSafeSerializedCapsule(html);
    return {
      html,
      manifest,
      sha256: createHash("sha256").update(html, "utf8").digest("hex"),
    };
  };

  return {
    preview,
    export(projectId, claimIds) {
      const capsule = preview(projectId, claimIds);
      repository.appendProvenance({
        action: "reviewer-capsule.exported",
        actorType: "system",
        projectId,
        metadata: {
          sha256: capsule.sha256,
          selectedClaimCount: capsule.manifest.selectedClaimIds.length,
          includedRecordCount: capsule.manifest.included.length,
          omittedRecordCount: capsule.manifest.omitted.length,
        },
      });
      return capsule;
    },
  };
}
