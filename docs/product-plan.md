# Product Plan: Cly — System of Record for Computational Research

## 1. Product vision

Cly is a **standalone research platform** that connects literature, code, experiments, outputs, decisions, and claims in one auditable workspace. It is not an IDE — it is the system of record for the entire research project, with an integrated coding workspace for computational work.

The system connects the complete computational research lifecycle:

```text
Research question
→ Literature discovery
→ Hypothesis and objectives
→ Methods and implementation plan
→ Code branch
→ Notebook or source-code changes
→ Experiment run
→ Figures and tables
→ Scientific claims
→ Review and reproducibility audit
→ Final report or publication
```

The core promise is:

> **Every source, decision, code change, experiment, output, and claim remains connected and traceable.**

Cly is not an IDE with research features bolted on. The research core — graph, sources, claims, provenance, and agent orchestration — is independent of any code editor. Cly includes a coding workspace (currently implemented with Dream IDE) and integrates with external editors (VS Code, Cursor, Jupyter) through extensions and APIs.

---

# 2. Product positioning

## Product category

**Research operating system**, or **system of record for computational research**.

Cly combines elements of:

* a literature-review system;
* an electronic research notebook;
* an experiment manager;
* a research knowledge graph;
* an agent orchestration platform;
* a reproducibility auditor;
* a coding workspace (integrated, not primary identity).

## Suggested positioning statement

> **The system of record for computational research — connecting papers, code, experiments, and claims with full provenance.**

## Suggested tagline

> **From research question to reproducible claim.**

Other strong taglines include:

> **Every paper, commit, experiment, and claim — connected.**

> **Build research you can explain, audit, and reproduce.**

> **Cly is not where you type every line. It's where you understand, coordinate, and verify the entire project.**

---

# 3. Target users

## Primary users

### Computational researchers

Researchers working with:

* Python;
* Jupyter notebooks;
* machine learning;
* scientific computing;
* simulations;
* data analysis;
* bioinformatics;
* astronomy;
* physics;
* engineering;
* economics;
* and other code-based fields.

### Student researchers

Students working on:

* science-fair projects;
* undergraduate research;
* independent studies;
* thesis projects;
* research competitions;
* and first publications.

### Research laboratories

Teams that need to coordinate:

* papers;
* repositories;
* experimental runs;
* datasets;
* decisions;
* research claims;
* and reproducibility checks.

### Research engineers and ML teams

Teams whose work combines software engineering and scientific experimentation.

---

# 4. Main user problem

Modern computational research is fragmented across many disconnected systems:

```text
Papers             → Zotero, arXiv, Google Scholar
Notes              → Notion, Docs, Obsidian
AI conversations   → ChatGPT, Claude, NotebookLM
Code               → IDEs and GitHub
Experiments        → notebooks, MLflow, W&B
Datasets           → local files, cloud storage, Hugging Face
Figures            → notebooks and plotting scripts
Decisions          → chats, meetings, or memory
Claims             → reports and manuscripts
```

This creates several problems:

* researchers forget why decisions were made;
* outputs become detached from the code that generated them;
* manuscript claims are not clearly linked to evidence;
* notebooks become difficult to understand;
* code changes invalidate results without warning;
* AI agents use hidden or outdated context;
* literature reviews become inconsistent;
* experiments are difficult to reproduce;
* and collaborators struggle to understand the state of a project.

The product should replace this fragmented workflow with a connected research model.

---

# 5. Core design principle: the research object graph

The **research object graph** should be the foundation of the entire application.

Instead of treating a project as only a folder of files, the application should recognize structured research objects.

## Core object types

```text
Project
Research question
Objective
Hypothesis
Source
Paper
Claim
Evidence
Method
Dataset
Code file
Notebook
Notebook cell
Experiment
Run
Metric
Figure
Table
Decision
Risk
Issue
Task
Branch
Commit
Pull request
Agent
Conversation
Research report
```

## Relationship examples

```text
Paper SUPPORTS Claim
Paper CONTRADICTS Claim
Claim ANSWERS Research Question
Objective REQUIRES Method
Method IMPLEMENTED_BY Code File
Notebook TESTS Hypothesis
Run EXECUTES Commit
Run USES Dataset Version
Figure GENERATED_BY Run
Claim USES Figure
Decision CHANGES Method
Pull Request MODIFIES Code File
Risk AFFECTS Claim
Agent PRODUCES Analysis
Source GROUNDS Agent Response
```

Every major feature should read from or write to this graph.

This allows the product to answer questions such as:

* Which claims depend on this code file?
* Which figures became stale after this merge?
* Which experiments support this conclusion?
* Which paper originally motivated this method?
* Which research objectives remain unfinished?
* Which claims have contradictory evidence?
* Why did the team choose this preprocessing method?
* Can the final result still be reproduced?

---

# 6. Product workspace layout

The application should provide an integrated coding workspace alongside research-specific navigation. The coding workspace (editor, terminal, git, notebooks) is a module within Cly, not its identity.

## Left sidebar

Suggested primary sections:

```text
Explorer
Research
Sources
Experiments
Claims
Graph
Agents
Git Workflow
Audits
Integrations
```

## Main editor area

The main area should support:

* source-code editing;
* notebook editing;
* PDF reading;
* literature matrix views;
* research-object pages;
* figure inspection;
* experiment comparison;
* claim editing;
* Markdown and LaTeX writing;
* graph visualization;
* and agent conversations.

## Right context panel

The right sidebar should show context for the currently selected item.

For a code file:

```text
Purpose
Linked objective
Implemented methods
Associated experiments
Dependent claims
Recent changes
Known risks
Agent notes
```

For a paper:

```text
Summary
Research question
Methods
Datasets
Key claims
Limitations
Relevant project claims
Contradictions
Citations
```

For a figure:

```text
Generating script
Notebook cell
Commit
Experiment run
Dataset version
Parameters
Supported claims
Reproducibility status
```

## Bottom panel

Extend the normal IDE terminal area with tabs for:

```text
Terminal
Problems
Test Results
Experiment Runs
Agent Activity
Audit Findings
Provenance
```

---

# 7. Major product modules

## Module 1: Research project initialization

When a user creates or imports a project, the application should offer a guided research setup.

### Inputs

* research topic;
* research question;
* field or discipline;
* project type;
* expected outputs;
* programming language;
* preferred model providers;
* available datasets;
* Git repository;
* deadline;
* collaborators.

### Generated project structure

```text
project/
  README.md
  research/
    question.md
    objectives.md
    hypotheses.md
    decisions.md
    claims.md
    risks.md
  literature/
    library/
    notes/
    matrix/
  src/
  notebooks/
  data/
    raw/
    interim/
    processed/
  experiments/
    configs/
    runs/
  outputs/
    figures/
    tables/
  reports/
  tests/
  .research-graph/
  .research-ide/
```

The user should be able to customize this structure.

### Automatic setup

The system could:

* initialize Git;
* connect or create a remote repository;
* create initial objectives;
* propose milestones;
* generate research tasks;
* configure experiment tracking;
* create reproducibility files;
* recommend branch protections;
* generate a first literature-search query;
* and create the initial research graph.

---

## Module 2: Full-control memory and context dashboard

This module lets users inspect and control exactly what information AI agents can access.

### Dashboard sections

#### Project memory

Long-term information such as:

* research goals;
* terminology;
* assumptions;
* selected methods;
* important papers;
* project conventions;
* accepted decisions;
* and known limitations.

#### Temporary task context

Information used only for a particular task or agent run.

#### Agent-specific context

Each agent can have separate:

* instructions;
* permissions;
* accessible files;
* accessible sources;
* memory;
* reasoning level;
* tool access;
* and token budget.

#### Context inspection

Before an agent runs, the user can view:

```text
Files included
Sources included
Prior conversations included
Graph objects included
Approximate token usage
Sensitive material
External transmission status
```

### Required controls

Users should be able to:

* include or exclude individual objects;
* lock important memories;
* remove outdated context;
* see why a context item was selected;
* distinguish model-generated memory from human-approved memory;
* view context history;
* and restore earlier memory versions.

---

## Module 3: Multi-agent research orchestration

Users should be able to configure a team of specialized AI agents.

## Example agent roles

```text
Research Planner
Literature Scout
Literature Reviewer
Methodology Critic
Implementation Agent
Experiment Agent
Statistics Reviewer
Reproducibility Auditor
Claim Auditor
Code Reviewer
Results Interpreter
Scientific Writer
Skeptical Reviewer
```

## Agent configuration

For each agent, the user selects:

* model provider;
* model;
* reasoning level;
* tool permissions;
* accessible project context;
* number of parallel instances;
* maximum cost;
* maximum runtime;
* approval requirements;
* output format;
* and whether the agent may modify files.

## Orchestration patterns

### Parallel review

Several agents independently review the same method.

### Debate

One agent proposes a method and another challenges it.

### Hierarchical execution

A planning agent creates tasks that specialist agents complete.

### Consensus

Multiple agents independently score literature or assess a claim.

### Human approval

An agent must pause before:

* editing files;
* running commands;
* creating branches;
* opening pull requests;
* merging code;
* spending beyond a limit;
* or sending information externally.

---

## Module 4: Provider and subscription management

The application should support both hosted APIs and local models.

### Provider types

* subscription-based AI access, where supported;
* API keys;
* local Ollama-compatible models;
* OpenAI-compatible endpoints;
* institution-hosted models;
* and mock providers for testing.

### Provider status interface

Each provider card should display:

```text
Configured or not configured
Local or remote
Data leaves machine or stays local
Available models
Estimated cost
Rate limits
Health status
Permitted tools
```

### Routing rules

Users could define policies such as:

```text
Use local models for source-code indexing.
Use a stronger hosted model for methodology review.
Never send unpublished datasets externally.
Use the cheapest model for metadata extraction.
Require approval before a task exceeds $1.
```

### Security requirement

Because agentic IDEs can expose powerful file and command capabilities, permissions must be designed around least privilege. Reports on AI-enabled IDE vulnerabilities have shown risks involving prompt injection, data leakage, and unintended code execution, so tool access should be isolated, inspectable, and approval-gated. ([[Tom's Hardware](https://www.tomshardware.com/tech-industry/cyber-security/researchers-uncover-critical-ai-ide-flaws-exposing-developers-to-data-theft-and-rce?utm_source=chatgpt.com)][1])

---

## Module 5: Semantic literature discovery

This module extends the current paper-search pipeline shown in the prototype.

## Search pipeline

```text
Research query
→ Query expansion
→ Candidate retrieval
→ Deduplication
→ Metadata filtering
→ Embedding-based retrieval
→ Cross-encoder reranking
→ Full-text relevance assessment
→ Information extraction
→ Literature matrix insertion
→ Field synthesis
```

## Candidate sources

Potential integrations include:

* arXiv;
* Semantic Scholar;
* Crossref;
* PubMed;
* OpenAlex;
* institutional libraries;
* user-uploaded PDFs;
* and citation graphs.

## Cross-encoder ranking

The first retrieval stage should prioritize recall by retrieving many possibly relevant papers.

The second stage should use a cross-encoder that jointly evaluates:

```text
Research question + paper title + abstract
```

Potential later stages could compare the research objective against:

* methods sections;
* results;
* limitations;
* datasets;
* and extracted claims.

## Paper scoring

Each paper could receive separate scores for:

```text
Topical relevance
Methodological relevance
Dataset relevance
Evidence usefulness
Recency
Reproducibility
Code availability
Contradiction potential
Overall project relevance
```

The app should explain the ranking instead of presenting an unexplained number.

Example:

> Ranked highly because the paper evaluates retrieval-augmented generation using a comparable corpus and retrieval metric. Its implementation relevance is moderate because complete preprocessing details are missing.

---

## Module 6: Source Manager

The Source Manager becomes the central library for project evidence.

### Supported source types

* papers;
* PDFs;
* webpages;
* books;
* datasets;
* documentation;
* GitHub repositories;
* model cards;
* uploaded notes;
* videos or transcripts;
* and NotebookLM-derived source collections.

### Source page

Each source should contain:

```text
Citation metadata
Full text or extracted text
Structured summary
Key claims
Methods
Datasets
Limitations
Relevant quotations
Linked research claims
Contradictory sources
Reliability notes
Reading status
Tags
Collections
```

### Source reliability

The app should separate:

* source quality;
* relevance;
* evidence strength;
* and agreement with the project hypothesis.

A source should never be marked as “good” merely because it supports the user's expected conclusion.

---

## Module 7: Literature matrix

The literature matrix should turn papers into structured, comparable evidence.

### Default columns

```text
Paper
Research question
Study type
Population or dataset
Method
Baseline
Metrics
Main findings
Limitations
Code availability
Data availability
Relevance
Supporting claims
Contradictions
Reviewer notes
```

### Capabilities

* customizable columns;
* AI-assisted extraction;
* human verification status;
* confidence indicators;
* filtering;
* sorting;
* comparison mode;
* duplicate detection;
* disagreement detection;
* and export to CSV, Markdown, or document formats.

Each extracted field should link back to the exact source passage.

---

## Module 8: Notebook scanner

Users should be able to import or open `.ipynb` notebooks and convert them into research artifacts.

### Extracted elements

* Markdown explanations;
* code cells;
* imports;
* datasets;
* functions;
* models;
* parameters;
* outputs;
* figures;
* tables;
* metrics;
* errors;
* execution order;
* and environment information.

### Notebook understanding

The system should infer:

```text
Notebook purpose
Linked research objective
Methods implemented
Experiments performed
Inputs and outputs
Claims supported
Potential data leakage
Hard-coded assumptions
Reproducibility issues
```

### Notebook risks

The scanner should detect:

* cells executed out of order;
* missing dependencies;
* unseeded randomness;
* hidden state;
* hard-coded local paths;
* outputs inconsistent with code;
* stale outputs;
* and excessively large embedded artifacts.

---

## Module 9: Code-to-research Linker

The Linker connects source code with scientific intent.

### For each code file, infer

* purpose;
* linked objective;
* method implemented;
* relevant datasets;
* experiments that use it;
* claims that depend on it;
* recent commits;
* tests;
* risks;
* and unresolved issues.

### Example file panel

```text
File: src/retrieval/reranker.py

Purpose:
Reranks retrieved papers using a cross-encoder.

Linked objective:
O-3 — Improve literature retrieval precision.

Implements:
M-4 — Semantic cross-encoder reranking.

Used by:
Experiment E-12
Run R-48
Run R-49

Supports:
Claim C-7 — Cross-encoder reranking improves top-10 relevance.

Risks:
Evaluation dataset may overlap with tuning examples.
No latency benchmark exists.
```

### Link creation

Links may be:

* automatically inferred;
* manually created;
* agent-proposed;
* or derived from execution traces.

Inferred links should remain marked as unverified until approved.

---

## Module 10: Experiment Manager

The Experiment Manager should work for both ML and general computational research.

## Experiment object

```text
Objective
Hypothesis
Method
Code version
Dataset version
Configuration
Environment
Random seed
Start and end time
Status
Metrics
Outputs
Logs
Notes
Conclusion
Linked claims
```

## Capabilities

* create experiment plans;
* generate configuration files;
* launch runs;
* compare runs;
* save environment information;
* capture Git commit;
* collect metrics;
* preserve logs;
* register outputs;
* and identify the best-performing run.

## Experiment comparison

The comparison interface should distinguish:

* parameter differences;
* code differences;
* data differences;
* environment differences;
* metric differences;
* and statistical uncertainty.

The app should discourage choosing a run based only on the highest headline metric.

---

## Module 11: Automated Git research workflow

This is one of the product’s most important differentiators.

The system should automatically organize software changes around research objectives.

## Workflow

```text
Research objective
→ Implementation task
→ Branch creation
→ Agent or human development
→ Tests and experiment checks
→ Pull request
→ Code review
→ Research-impact review
→ Conflict resolution
→ Approval
→ Merge
→ Affected-artifact audit
```

## Branch generation

Branch names could follow a consistent structure:

```text
research/O-03-cross-encoder-reranking
experiment/E-12-reranker-comparison
fix/RISK-07-data-leakage
docs/C-05-update-claim-evidence
```

## Pull request generation

The system should automatically produce:

```text
Research motivation
Linked objective
Method changed
Files changed
Experiments required
Claims potentially affected
Figures potentially affected
Risks
Validation checklist
```

## Dual review

Every pull request should receive two forms of review.

### Software review

* correctness;
* tests;
* maintainability;
* security;
* performance;
* and style.

### Research review

* methodological validity;
* data leakage;
* statistical assumptions;
* effect on experiments;
* effect on claims;
* effect on reproducibility;
* and required reruns.

## Conflict resolution

The application should explain conflicts semantically.

Instead of:

> Conflict in `preprocess.py` lines 42–59.

It could say:

> Both branches changed the missing-value strategy. Branch A uses median imputation, while Branch B removes incomplete rows. Choosing either approach changes the input distribution for Experiments E-8 through E-11.

The app may suggest a resolution, but the researcher should approve scientifically meaningful conflicts.

## Post-merge impact analysis

After a merge, the system should determine:

* which experiments are stale;
* which figures require regeneration;
* which claims require review;
* which notebooks depend on changed functions;
* and whether the reproducibility status changed.

---

## Module 12: Claim Audit Board

The Claim Audit Board should make scientific claims first-class objects.

## Claim card

```text
Claim text
Claim type
Status
Confidence
Supporting sources
Contradictory sources
Supporting experiments
Relevant figures
Assumptions
Limitations
Reviewer comments
Last verified date
```

## Suggested statuses

```text
Draft
Unsupported
Partially supported
Supported
Contested
Superseded
Rejected
Needs rerun
```

## Claim audit checks

* Is the claim stronger than the evidence?
* Does the figure actually support it?
* Are contradictory studies acknowledged?
* Does the experiment use the correct dataset?
* Is statistical uncertainty included?
* Is the claim based on a stale run?
* Does the source say what the summary claims it says?
* Is the claim causal or merely correlational?
* Has the underlying method changed?

The board should allow users to view the complete evidence chain for every important conclusion.

---

## Module 13: Figure and table provenance

Every generated figure and table should have a provenance record.

## Provenance chain

```text
Figure
→ generating notebook cell or script
→ function
→ experiment run
→ code commit
→ configuration
→ dataset version
→ environment
→ research claim
→ report section
```

## Figure page

```text
Preview
Caption
Purpose
Generation command
Source file
Notebook cell
Run ID
Commit
Dataset checksum
Parameters
Linked claims
Last reproduced
Current or stale
```

## Staleness detection

A figure becomes potentially stale when:

* generating code changes;
* upstream data changes;
* experiment configuration changes;
* preprocessing changes;
* or the linked run is superseded.

The application should not automatically delete it. It should mark it and explain why it may be stale.

---

## Module 14: Reproducibility Auditor

The auditor evaluates whether another researcher could regenerate the project’s outputs.

## Audit areas

### Code

* committed;
* executable;
* tested;
* documented;
* and linked to the relevant method.

### Environment

* dependency versions captured;
* operating-system assumptions documented;
* hardware requirements recorded;
* and container or environment files available.

### Data

* source recorded;
* license captured;
* version identified;
* preprocessing documented;
* and access requirements explained.

### Experiments

* configuration saved;
* random seeds recorded;
* run commands stored;
* metrics captured;
* and failed runs preserved when relevant.

### Outputs

* figures regeneratable;
* tables regeneratable;
* provenance complete;
* and outputs match the current code.

### Claims

* supported by current results;
* limitations documented;
* contradictory evidence considered;
* and stale evidence flagged.

## Audit output

The system should generate:

```text
Overall reproducibility score
Blocking issues
Warnings
Missing artifacts
Affected claims
Recommended fixes
Generated reproducibility report
```

The score must not hide the individual findings. The detailed evidence is more important than the number.

---

## Module 15: Research decision log

Important decisions should be recorded as structured objects rather than disappearing into chat history.

## Decision entry

```text
Decision
Date
Author
Context
Options considered
Evidence reviewed
Chosen option
Reasoning
Expected consequences
Affected objects
Revisit condition
Status
```

## Example

```text
Decision:
Use a cross-encoder after initial embedding retrieval.

Options:
1. Keyword-only ranking
2. Bi-encoder ranking
3. Bi-encoder retrieval followed by cross-encoder reranking

Reason:
Option 3 preserves broad recall while improving final relevance.

Affected objects:
Method M-4
Experiment E-12
File reranker.py
Claim C-7

Revisit when:
Latency exceeds the project’s interactive search threshold.
```

---

## Module 16: Next-step planner

The planner should recommend actions based on the project graph rather than only generating generic advice.

## Inputs

* unfinished objectives;
* unresolved risks;
* unsupported claims;
* failed experiments;
* unread high-relevance papers;
* stale figures;
* Git status;
* deadlines;
* and available compute.

## Example recommendations

```text
1. Rerun Experiment E-12 because preprocessing changed in PR #18.
2. Review three contradictory papers linked to Claim C-7.
3. Add a baseline without cross-encoder reranking.
4. Regenerate Figure F-4 using the latest dataset version.
5. Resolve the missing random seed in Notebook N-3.
```

Each recommendation should include:

* reason;
* priority;
* estimated effort;
* dependencies;
* expected benefit;
* and the objects affected.

---

## Module 17: External integrations

## Initial integrations

Prioritize:

* GitHub;
* Hugging Face;
* Jupyter;
* arXiv;
* Semantic Scholar or OpenAlex;
* Zotero;
* local file systems;
* cloud object storage;
* and model providers.

## Later integrations

* GitLab;
* Overleaf;
* NotebookLM-compatible workflows;
* MLflow;
* Weights & Biases;
* DVC;
* institutional repositories;
* reference managers;
* and compute platforms.

## Integration rule

The app should not duplicate every external tool. It should become the layer that connects external objects to the research graph.

For example:

```text
GitHub PR → Method → Experiment → Figure → Claim
Hugging Face dataset → Dataset Version → Run → Metric
Zotero paper → Evidence → Claim
```

---

# 8. Key user workflows

## Workflow A: Begin a research project

1. User enters the research topic.
2. The app helps refine the question.
3. The app creates objectives and candidate hypotheses.
4. The user approves the project structure.
5. The system initializes the repository.
6. The literature agent searches for papers.
7. Relevant papers enter the Source Manager.
8. The literature matrix is populated.
9. Initial methods and experiments are proposed.
10. The research graph is created.

## Workflow B: Implement a research method

1. User selects an objective.
2. The planner creates an implementation task.
3. The app creates a Git branch.
4. An agent proposes a plan.
5. The user approves the plan.
6. Code or notebook changes are made.
7. Tests and checks run.
8. An experiment is created.
9. Results are registered.
10. A pull request is opened.
11. Software and methodology reviews run.
12. The user approves and merges.
13. Affected experiments, figures, and claims are updated.

## Workflow C: Add a scientific claim

1. User highlights a result or writes a claim.
2. The system finds relevant runs, figures, and sources.
3. Supporting and conflicting evidence is shown.
4. The user adjusts the wording.
5. The claim auditor checks its strength.
6. The claim is added to the graph.
7. It can later be inserted into a report.

## Workflow D: Reproduce a result

1. User selects a figure.
2. The provenance view identifies the original run.
3. The environment and data versions are restored.
4. The generation command runs in isolation.
5. The new output is compared with the original.
6. Differences are explained.
7. Reproducibility status is updated.

---

# 9. Technical architecture

Research services are modular and independent of the coding workspace. This allows the editor to be replaced or supplemented with external IDE integrations.

## Architectural layers

```text
Cly Application (dashboard, literature, experiments, claims, audits)
│
├── Cly Core (research objects, relationships, provenance, services)
├── Coding Workspace (editor, terminal, git, notebooks)
├── Agent orchestration layer
├── Literature pipeline
├── Experiment tracking service
├── Provenance service
├── Reproducibility service
├── Provider gateway
└── Integration adapters (VS Code, Jupyter, GitHub, CLI)
```

## Frontend

Likely responsibilities:

* IDE views and panels;
* graph visualization;
* literature matrix;
* experiment dashboards;
* audit interfaces;
* context inspector;
* diff and provenance views;
* and settings.

## Backend services

Suggested services:

```text
project-service
graph-service
source-service
literature-service
agent-service
provider-service
experiment-service
provenance-service
git-service
audit-service
integration-service
```

For an early product, these should probably begin as modules in one backend rather than separate networked microservices.

## Storage

### Relational database

Use for:

* users;
* projects;
* settings;
* experiment metadata;
* tasks;
* permissions;
* and integration records.

### Graph representation

Initially, graph edges can be stored in relational tables:

```text
objects
object_versions
relationships
relationship_evidence
```

A dedicated graph database should only be added when relationship traversal and scale justify it.

### Vector index

Use for:

* semantic paper retrieval;
* source passage retrieval;
* project-memory retrieval;
* and code or notebook retrieval.

### Artifact storage

Use content-addressed storage for:

* PDFs;
* datasets;
* figures;
* tables;
* logs;
* notebook outputs;
* and experiment artifacts.

### Local-first option

Research projects may contain private or unpublished data. The architecture should support:

* local metadata storage;
* local vector indexes;
* local models;
* user-controlled synchronization;
* and explicit external transmission notices.

---

# 10. Internal data model

## Research object

```ts
interface ResearchObject {
  id: string;
  projectId: string;
  type: ResearchObjectType;
  title: string;
  description?: string;
  status: string;
  source: "human" | "agent" | "integration" | "system";
  verificationStatus: "unverified" | "reviewed" | "approved";
  createdAt: string;
  updatedAt: string;
  version: number;
  metadata: Record<string, unknown>;
}
```

## Relationship

```ts
interface ResearchRelationship {
  id: string;
  projectId: string;
  sourceObjectId: string;
  targetObjectId: string;
  relationType: string;
  confidence?: number;
  evidenceObjectIds: string[];
  source: "human" | "agent" | "integration" | "system";
  verificationStatus: "unverified" | "reviewed" | "approved";
  createdAt: string;
}
```

## Provenance event

```ts
interface ProvenanceEvent {
  id: string;
  projectId: string;
  eventType: string;
  actorType: "human" | "agent" | "system";
  actorId: string;
  inputObjectIds: string[];
  outputObjectIds: string[];
  command?: string;
  codeCommit?: string;
  environmentId?: string;
  timestamp: string;
}
```

This event model makes it possible to reconstruct how an artifact was created.

---

# 11. Security and permissions

The application will grant agents access to source code, terminals, repositories, research data, and outside services. Security therefore has to be part of the initial architecture.

## Permission categories

```text
Read project files
Write project files
Execute commands
Access network
Read secrets
Use external model
Create branch
Commit changes
Open pull request
Merge pull request
Launch experiment
Upload artifacts
Modify research claims
```

## Execution isolation

Agent-run commands should use:

* sandboxed processes;
* project-specific working directories;
* restricted environment variables;
* network controls;
* time limits;
* resource limits;
* and auditable logs.

## Prompt-injection defenses

External papers, repositories, webpages, notebook text, and tool outputs must be treated as untrusted data.

The app should:

* distinguish instructions from retrieved content;
* prevent documents from granting tools or permissions;
* require approval for sensitive actions;
* sanitize imported project configuration;
* isolate external content from system instructions;
* and log the reason for each tool call.

---

# 12. Development roadmap

## Phase 0: Foundation and assessment ✅

Cly identity, CI, tests, repository governance, and security policy established. Dream IDE assessed as coding workspace component. UI shell prototype complete with fixture-backed screens.

### Deliverables

- Independent Cly identity and release path
- CI, tests, and security policy
- Dream architecture and licensing assessment
- UI shell with full research navigation (complete)

---

## Phase 1: Research core with real persistence

### Goal

Replace fixture-backed mock services with real project-scoped persistence. Make the research graph, claims, sources, and experiments survive restart.

### Features

* branded application shell;
* research project creation;
* research sidebar;
* structured objectives and hypotheses;
* Source Manager;
* basic research object graph;
* local project database;
* provider configuration;
* local and hosted model support;
* GitHub repository connection;
* and foundational permissions.

### Success condition

A user can create a project, add a research question, import papers, connect a repository, and view links among objectives, sources, and files.

---

## Phase 2: Literature intelligence

### Features

* arXiv or OpenAlex retrieval;
* metadata normalization;
* PDF acquisition;
* PDF parsing;
* embeddings;
* cross-encoder reranking;
* paper summaries;
* structured extraction;
* literature matrix;
* folders and reading lists;
* duplicate detection;
* and source-grounded synthesis.

### Success condition

For a research topic, the app returns meaningfully ranked papers and explains why each paper is relevant.

---

## Phase 3: Notebook and code intelligence

### Features

* `.ipynb` import;
* notebook cell extraction;
* notebook artifact creation;
* code-symbol indexing;
* file-purpose inference;
* objective and method linking;
* risk detection;
* experiment references;
* and contextual research panels.

### Success condition

A user can select a notebook or code file and understand its scientific purpose, dependencies, risks, and linked objectives.

---

## Phase 4: Experiment and provenance system

### Features

* experiment definitions;
* run tracking;
* Git commit capture;
* dataset version references;
* configuration storage;
* metric logging;
* figure and table registration;
* artifact lineage;
* run comparison;
* and stale-output detection.

### Success condition

A figure can be traced back to its run, configuration, commit, data, and generating code.

---

## Phase 5: Git workflow orchestrator

### Features

* objective-based task creation;
* automatic branch creation;
* commit assistance;
* pull-request generation;
* software review;
* methodology review;
* conflict explanations;
* merge approval;
* post-merge impact analysis;
* and stale-object updates.

### Success condition

A research objective can move through a full branch-to-merge workflow while all scientific dependencies remain visible.

---

## Phase 6: Claims and reproducibility

### Features

* Claim Audit Board;
* evidence linking;
* contradiction tracking;
* claim-strength review;
* reproducibility rules;
* audit reports;
* environment checks;
* notebook-order checks;
* figure regeneration checks;
* and publication-readiness review.

### Success condition

The user can inspect any major claim and see whether the evidence and underlying result are current, sufficient, and reproducible.

---

## Phase 7: Multi-agent orchestration

### Features

* configurable agent roles;
* parallel agents;
* reasoning controls;
* provider routing;
* cost budgets;
* context dashboard;
* approval checkpoints;
* debate and consensus workflows;
* and agent activity history.

### Success condition

Multiple agents can work on a project without losing source grounding, exceeding permissions, or hiding the origin of their output.

---

## Phase 8: Collaboration and external ecosystem

### Features

* team workspaces;
* comments and review;
* role-based permissions;
* Zotero integration;
* Hugging Face integration;
* MLflow or W&B adapters;
* report and manuscript exports;
* institution deployment;
* and shared research templates.

---

# 13. Recommended MVP

The first version should not attempt to implement the entire vision.

## MVP goal

> Allow a computational researcher to discover papers, connect them to a research plan, connect code and notebooks to that plan, and trace an experiment’s output back to its evidence and implementation.

## MVP features

1. Research project and objective manager
2. Semantic paper search with cross-encoder reranking
3. Source Manager
4. Basic literature matrix
5. Notebook scanner
6. Code-to-objective Linker
7. Basic experiment tracking
8. Git branch and pull-request workflow
9. Figure provenance
10. Simple claim board
11. OpenAI-compatible, Anthropic-compatible, and local provider routing
12. Research object graph

## Exclude from the first MVP

* complex autonomous multi-agent teams;
* automatic conflict resolution without approval;
* full manuscript authoring;
* institutional permissions;
* every literature database;
* every experiment-tracking provider;
* automatic causal or statistical judgment;
* and a general marketplace of integrations.

These can create large amounts of complexity before the fundamental graph and provenance experience is proven.

---

# 14. MVP acceptance test

A successful end-to-end demonstration could use this scenario:

```text
1. User creates a project on retrieval-augmented generation.
2. The app retrieves 100 candidate papers.
3. A cross-encoder ranks the most relevant 10.
4. The user saves five papers to the literature matrix.
5. The app extracts their methods and limitations.
6. The user creates an objective to test reranking methods.
7. The app creates a Git branch.
8. The user imports an existing notebook.
9. The notebook scanner identifies the retrieval and evaluation cells.
10. The Linker connects those cells to the objective.
11. The user runs an experiment.
12. The run records the commit, parameters, metrics, and dataset.
13. A figure is generated and registered.
14. The user creates a claim based on the figure.
15. The claim links to the experiment and supporting papers.
16. A pull request is opened and reviewed.
17. The code is merged.
18. The reproducibility auditor verifies that the result can be regenerated.
```

If that complete chain feels natural, the core product is working.

---

# 15. Product principles

## Human approval for scientific decisions

Agents may propose, analyze, and automate routine work. Humans should approve:

* hypotheses;
* methodological changes;
* interpretations;
* major claims;
* conflict resolutions;
* and final merges.

## Provenance by default

The user should not need to manually reconstruct where an output originated.

## Local-first where practical

Private research should not require automatic external transmission.

## Explain every automated relationship

The app should show why it linked a paper, file, run, figure, or claim.

## Preserve uncertainty

The app should represent:

* conflicting evidence;
* incomplete information;
* low-confidence extraction;
* inconclusive runs;
* and disputed interpretations.

## Integrate rather than replace

The product should connect GitHub, Jupyter, Hugging Face, literature sources, and experiment platforms rather than rebuilding every external service.

## Research structure without excessive friction

The system should capture provenance automatically during normal work. Researchers will avoid the product if every action requires filling out a large form.

---

# 16. Final product definition

> **Cly is a standalone research platform — the system of record for computational research. It unifies literature discovery, source management, computational notebooks, code development, experiment tracking, scientific claims, provenance, and reproducibility. It structures research as a connected object graph so every conclusion can be traced from the original question through the supporting papers, decisions, code, experiments, and outputs. It includes an integrated coding workspace and connects with external editors through extensions and APIs.**

The strategic focus should not be “another AI coding editor.”

It should be:

> **The system of record for computational research.**

[1]: https://www.tomshardware.com/tech-industry/cyber-security/researchers-uncover-critical-ai-ide-flaws-exposing-developers-to-data-theft-and-rce?utm_source=chatgpt.com "Critical flaws found in AI development tools are dubbed an 'IDEsaster' - data theft and remote code execution possible"
