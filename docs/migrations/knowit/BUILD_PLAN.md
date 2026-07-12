# Local Research Field Mapper Build Plan

**Goal:** Build an Elicit-like research workflow that is local-first, free for you and friends, privacy-friendly, and able to use local models, bundled/local project models, or user-provided AI subscriptions and API keys.

**Learning Rule:** You write the code yourself. This plan tells you what to build, in what order, and why. Ask for help with specific parts when you want code support.

**Product Thesis:** We are not trying to beat Elicit by owning a larger paper database. We are building a local-first research harness that combines open paper sources, transparent ranking/extraction/synthesis, and user-controlled AI providers.

---

## 1. What This Project Is

This app helps a user understand a research field from a plain-English topic.

Example:

```text
retrieval augmented generation
diffusion policy learning
tool-using language models
test-time compute
```

The app should:

1. Search open scholarly sources.
2. Retrieve candidate papers.
3. Rank papers by topic relevance.
4. Extract structured research notes per paper.
5. Synthesize a field landscape.
6. Show clusters, tensions, open problems, and reading paths.
7. Let the user choose the AI engine that powers the workflow.

The app is a **research workflow harness**, not a single fixed AI model.

---

## 2. Why This Can Matter Even Though Elicit Exists

Elicit and similar tools already exist. That is not a reason to stop.

They prove the workflow is valuable.

Our version is useful because it can be:

- **Local-first:** users can run it on their own machine.
- **Private:** user topics, paper notes, and API keys do not need to live in someone else's platform.
- **Free for friends:** no required subscription to the app itself.
- **Bring-your-own-AI:** users can use Ollama, local models, OpenAI, Claude, Gemini, OpenRouter, or other providers.
- **Transparent:** users can inspect how papers were retrieved, ranked, extracted, and synthesized.
- **Hackable:** prompts, ranking logic, paper sources, and UI can be modified.
- **ML/arXiv-focused first:** we can build a sharp product for fast-moving ML research before trying to support every academic domain.

Do not try to compete first on:

```text
largest corpus
enterprise polish
clinical systematic-review compliance
hosted infrastructure
commercial integrations
```

Compete first on:

```text
local control
low cost
privacy
model flexibility
transparent workflows
fast learning experience
```

---

## 3. Core Architecture

The app has five major layers:

```text
Frontend UI
Research workflow pipeline
AI provider harness
Paper source connectors
Local storage
```

### Frontend UI

The user-facing research workspace.

Responsibilities:

- Topic input
- Run progress
- Paper table
- Paper detail view
- Extraction summaries
- Landscape view
- Reading path
- Provider settings

### Research Workflow Pipeline

Coordinates the work.

Pipeline:

```text
topic
-> search papers
-> normalize papers
-> rank papers
-> extract per-paper notes
-> synthesize landscape
-> build reading map
```

### AI Provider Harness

One interface for many AI engines.

Supported directions:

```text
Mock provider
Ollama provider
Built-in local model provider
OpenAI-compatible provider
Anthropic Claude provider
Google Gemini provider
OpenRouter provider
```

The pipeline should never directly depend on a specific provider.

### Paper Source Connectors

Connectors fetch paper metadata from open sources.

Start with:

```text
arXiv
```

Add later:

```text
OpenAlex
Semantic Scholar
Crossref
PubMed
local PDF/library import
```

### Local Storage

Stores the user's research workspace.

Start with:

```text
SQLite
```

Add later if needed:

```text
local vector store
Postgres for hosted/team mode
```

---

## 4. Target Stack

### Backend

```text
Python
FastAPI
SQLite
arxiv package
sentence-transformers
Ollama HTTP API
```

Later:

```text
llama.cpp
OpenAI SDK or OpenAI-compatible client
Anthropic SDK
Google Gemini SDK
Qdrant or Chroma
```

### Frontend

```text
Next.js
TypeScript
Tailwind CSS
```

Later:

```text
TanStack Table
React Flow or another graph/map library
desktop wrapper if you want a local app feel
```

### Local AI Strategy

Build in this order:

1. Mock provider
2. Ollama generation provider
3. Local embedding/ranking models
4. OpenAI-compatible cloud provider
5. Claude/Gemini provider
6. Built-in local model runtime

The mock provider lets you test the app without a GPU, API key, or model download.

---

## 5. Suggested Folder Structure

You do not need to create all of this immediately. This is the direction.

```text
research-field-mapper/
  BUILD_PLAN.md
  README.md
  docs/
    PROJECT_BRIEF.md
    ARCHITECTURE.md
    DATA_SOURCES.md
    AI_PROVIDER_STRATEGY.md
    PROMPTS.md
  backend/
    app/
      main.py
      routes/
      models/
      services/
        ai_providers/
        paper_sources/
        ranking/
        extraction/
        synthesis/
      storage/
      pipeline/
    tests/
    requirements.txt
    .env.example
  frontend/
    app/
    components/
    lib/
    package.json
    .env.local.example
```

---

## 6. Milestone 1: Backend Skeleton

**Purpose:** Learn how the backend represents a research run.

**Build:**

- FastAPI backend
- Health route
- Create-run route
- Get-run route
- In-memory run store

**Routes:**

```text
GET /health
POST /api/runs
GET /api/runs/{run_id}
```

**Run fields:**

```text
run_id
topic
status
current_stage
created_at
updated_at
error_message
```

**Statuses:**

```text
created
searching
ranking
extracting
synthesizing
complete
failed
```

**Done when:**

- You can start the backend.
- You can create a run from a topic.
- You can fetch the run by ID.
- No arXiv or AI is involved yet.

---

## 7. Milestone 2: arXiv Search Connector

**Purpose:** Fetch real ML papers from a free open source.

**Build:**

- arXiv search service
- Paper normalization model
- Search route or pipeline stage

**Paper fields:**

```text
paper_id
source
source_id
title
authors
abstract
published_date
updated_date
paper_url
pdf_url
categories
```

**Defaults:**

```text
source: arxiv
max_results: 25
sort: relevance
```

**Done when:**

- Searching `retrieval augmented generation` returns real papers.
- Each paper has title, abstract, authors, paper URL, and PDF URL.
- Bad or empty searches do not crash the backend.

---

## 8. Milestone 3: Simple Ranking Baseline

**Purpose:** Build a debuggable ranking baseline before adding model-based ranking.

**Build:**

- Simple ranker
- Relevance score
- Ranking explanation

**Simple scoring idea:**

```text
title topic matches count more
abstract topic matches count less
exact phrase match gets a bonus
```

**Ranked paper fields:**

```text
paper
rank_position
relevance_score
ranking_method
ranking_explanation
```

**Done when:**

- Papers with topic terms in title/abstract rise to the top.
- You can explain why a paper ranked highly.
- This works without AI.

---

## 9. Milestone 4: AI Provider Harness

**Purpose:** Make the app model-flexible from the start.

**Build:**

- Provider interface
- Mock provider
- Provider registry
- Provider health checks
- Ollama provider after mock provider works

**Provider interface:**

```text
generate_text(prompt, options)
generate_json(prompt, schema, options)
embed_texts(texts, options)
rerank(query, documents, options)
health_check()
```

**Provider types:**

```text
mock
ollama
built_in_local
openai_compatible
anthropic
gemini
openrouter
```

**Capability flags:**

```text
supports_text_generation
supports_json_generation
supports_embeddings
supports_reranking
supports_streaming
supports_long_context
```

**Provider routes:**

```text
GET /api/ai/providers
GET /api/ai/providers/{provider_name}/health
POST /api/ai/providers/test
```

**Security rules:**

- API keys never go in frontend code.
- Backend reads keys from environment variables first.
- Later, desktop/local encrypted key storage can be added.
- The app should work without any cloud API key.

**Done when:**

- Mock provider returns fake structured data.
- Backend can detect whether Ollama is available.
- Pipeline code does not import provider-specific code.

---

## 10. Milestone 5: Frontend Skeleton

**Purpose:** Build the first visible user workflow.

**Build:**

- Topic input
- Submit button
- Run status display
- Paper list display
- Provider status panel

**User flow:**

```text
User enters topic
frontend creates run
backend searches arXiv
backend ranks papers
frontend displays results
```

**Done when:**

- You can type a topic in the browser.
- The backend receives it.
- The browser shows ranked papers.
- The UI shows which AI provider is selected, even if extraction is not built yet.

---

## 11. Milestone 6: SQLite Persistence

**Purpose:** Save research work across restarts.

**Build:**

- SQLite database
- Tables for runs and papers
- Save/load functions

**Tables:**

```text
runs
papers
run_papers
ai_provider_settings
```

**Done when:**

- Restarting the backend does not lose previous runs.
- The same source paper is not duplicated endlessly.
- Provider settings can be read by the backend.

---

## 12. Milestone 7: Background Pipeline

**Purpose:** Run multi-step research workflows without freezing the API.

**Build:**

- Pipeline function
- Stage transitions
- Error handling
- Frontend polling

**Pipeline stages:**

```text
created
searching
ranking
extracting
synthesizing
complete
failed
```

**Done when:**

- The UI shows stage changes.
- Partial results are saved as they appear.
- A failed stage marks the run as failed with a useful error.

---

## 13. Milestone 8: Structured Paper Extraction

**Purpose:** Turn papers into reusable research notes.

**Build:**

- Extraction prompt
- Structured output schema
- Extraction service that calls the provider harness
- Storage for extracted notes

**Extraction fields:**

```text
problem
method
datasets_or_setting
key_results
main_contribution
limitations
tags
confidence
source_quote_or_evidence
```

**Important rule:**

Start with title and abstract only. Full PDF reading comes later.

**Done when:**

- Top 5-10 ranked papers get structured summaries.
- Mock provider and Ollama provider can both power extraction.
- Malformed model output does not crash the whole run.

---

## 14. Milestone 9: Landscape Synthesis

**Purpose:** Create field-level understanding from many paper notes.

**Build:**

- Synthesis prompt
- Structured landscape schema
- Cluster generation
- Tensions and open problems
- Reading path

**Landscape fields:**

```text
overview
clusters
relationships
tensions
open_problems
recommended_reading_path
```

**Local-model strategy:**

If the selected model has a small context window, synthesize in smaller steps:

```text
paper notes -> mini cluster summaries
mini cluster summaries -> full landscape
```

**Done when:**

- The app produces a landscape that references actual papers.
- The output is structured enough for the frontend.
- Local models can run a smaller version of the synthesis.

---

## 15. Milestone 10: Open Paper Source Expansion

**Purpose:** Avoid being limited to arXiv.

**Build connectors in this order:**

1. arXiv
2. OpenAlex
3. Semantic Scholar
4. Crossref
5. PubMed if you want biomedical coverage
6. Local PDF/library import

**Source connector interface:**

```text
search_papers(topic, options)
get_paper(source_id)
normalize_paper(raw_result)
```

**Why this matters:**

Elicit has access to a huge corpus. We should not pretend arXiv alone matches that.

Instead, we use open scholarly infrastructure and combine sources:

```text
arXiv for ML preprints
OpenAlex for broad scholarly metadata
Semantic Scholar for paper graph/recommendation-style metadata
Crossref for DOI/publisher metadata
PubMed for biomedical papers
local PDFs for personal libraries
```

**Done when:**

- A topic search can pull from more than one source.
- Duplicate papers are merged by arXiv ID, DOI, title similarity, or source IDs.
- The UI shows which source each paper came from.

---

## 16. Milestone 11: Better Ranking

**Purpose:** Improve relevance beyond keyword matching.

**Build in this order:**

1. Local embeddings
2. Local semantic search
3. Local cross-encoder reranker
4. Optional cloud reranking provider

**Ranking layers:**

```text
candidate retrieval
simple keyword score
embedding similarity score
cross-encoder relevance score
final blended score
```

**Done when:**

- Relevant papers rise even when they do not share exact topic words.
- The ranking method is visible and explainable.
- The simple ranker remains as a fallback.

---

## 17. Milestone 12: Reading Map UI

**Purpose:** Make the synthesis explorable.

**Start simple:**

```text
cluster list
papers inside each cluster
open problems list
recommended reading path
paper detail panel
```

**Add later:**

```text
graph nodes
relationship edges
filters
saved notes
compare landscapes
```

**Done when:**

- A user can understand the topic without opening every paper.
- Clicking a cluster shows its papers.
- Clicking a paper shows extraction notes and source metadata.

---

## 18. Milestone 13: Topic Memory and Growth Over Time

**Purpose:** Make the app useful as a long-term research companion.

**Build:**

- Saved topics
- Refresh topic
- New paper detection
- Landscape versioning

**Entities:**

```text
topics
topic_snapshots
landscape_versions
```

**Done when:**

- A saved topic can be refreshed later.
- New papers are marked.
- The user can compare old and new landscapes.

---

## 19. Milestone 14: Built-In Local Model Mode

**Purpose:** Let users run the app without manually setting up Ollama, eventually.

Do not build this first.

Possible approaches:

```text
download a recommended GGUF model during setup
ship a small extraction-focused model
use llama.cpp behind the scenes
offer Basic/Balanced/Research presets
```

Challenges:

```text
large model downloads
RAM/VRAM differences
Windows/macOS/Linux packaging
model licensing
slow inference on weak machines
```

**Done when:**

- A user can install the app and select a recommended local model flow.
- The app warns clearly when hardware is too weak.
- Ollama mode still remains supported.

---

## 20. Milestone 15: Full PDF Reading

**Purpose:** Improve extraction quality beyond abstracts.

**Build:**

- PDF download
- Text extraction
- Section detection
- Chunked summarization

**Sections to identify:**

```text
abstract
introduction
method
experiments
results
limitations
conclusion
```

**Done when:**

- Full-text extraction improves notes when PDFs parse correctly.
- Abstract-only mode remains the fallback.
- The app does not send huge unbounded text to the model.

---

## 21. Milestone 16: Polish and Reliability

**Purpose:** Make the app feel trustworthy.

**Build:**

- Better loading states
- Better failure states
- Retry controls
- Partial result display
- Provider setup guidance
- Source coverage warnings

**Important user-facing states:**

```text
No papers found
arXiv unavailable
Ollama not running
Cloud API key missing
Model output invalid
Partial results available
Run complete
```

**Done when:**

- A failed AI call does not destroy the whole run.
- The user can inspect partial results.
- The UI explains what went wrong in plain language.

---

## 22. Milestone 17: Sharing With Friends

**Purpose:** Let friends use it without paying for your infrastructure.

Good sharing paths:

```text
local install instructions
Docker Compose later
desktop app later
LAN mode later
optional hosted demo later
```

Recommended first friend-sharing mode:

```text
They run the backend and frontend locally.
They install Ollama or bring their own API key.
They use SQLite on their own machine.
```

Do not host a public free cloud version first. That turns your free tool into your personal infrastructure bill.

---

## 23. Recommended Build Order

Build in this exact order:

1. Backend skeleton
2. arXiv search connector
3. Simple ranking baseline
4. AI provider harness with mock provider
5. Ollama provider
6. Frontend search and paper list
7. SQLite persistence
8. Background pipeline
9. Structured paper extraction
10. Landscape synthesis
11. OpenAlex connector
12. Better local ranking
13. Reading map UI
14. Topic memory
15. Full PDF reading
16. Built-in local model mode
17. Friend-friendly packaging

This order keeps the app testable and prevents the hard AI parts from swallowing the whole project too early.

---

## 24. What Not To Build First

Avoid these at the beginning:

- User accounts
- A public hosted cloud service
- Full PDF parsing
- Complex graph UI
- Built-in model packaging
- Authentication
- Celery or Redis
- Clinical systematic-review features
- Perfect extraction prompts
- A beautiful landing page

These can come later. The first victory is:

```text
topic -> arXiv papers -> ranked list -> local/mock AI extraction -> basic landscape
```

---

## 25. First Five Coding Sessions

### Session 1: Backend Runs

Build the FastAPI skeleton and create/fetch research runs.

Done when:

- You can create a run.
- You can fetch a run.
- The server has a health route.

### Session 2: arXiv Search

Connect arXiv and normalize paper results.

Done when:

- Searching an ML topic returns real papers.
- The response shape is stable.

### Session 3: Ranking

Add the simple keyword/phrase ranker.

Done when:

- Papers are sorted by a visible relevance score.
- Each ranking has a plain-English explanation.

### Session 4: AI Harness

Create the mock provider and provider registry.

Done when:

- The app can ask a provider for structured fake extraction output.
- The rest of the pipeline does not know which provider is used.

### Session 5: Frontend MVP

Create the first UI.

Done when:

- You can type a topic in the browser.
- You can see ranked papers.
- You can see selected provider status.

---

## 26. Key Design Rules

Keep these rules in mind throughout the project:

1. **Every stage should be testable by itself.**
2. **The pipeline should not know which AI provider is selected.**
3. **The frontend should never see API keys.**
4. **The app should work without a cloud account.**
5. **arXiv first, but not arXiv forever.**
6. **Simple baseline before advanced model.**
7. **Abstract-only before full PDF parsing.**
8. **Local install before public hosting.**

---

## 27. When To Ask For Help

Good specific asks:

- Help me design the first FastAPI routes.
- Help me create the arXiv connector.
- Help me design the provider interface.
- Help me add Ollama health checks.
- Help me design the extraction schema.
- Help me debug frontend-to-backend calls.
- Help me choose a local embedding model.
- Help me decide how to deduplicate OpenAlex and arXiv results.

This keeps you in control while still letting me help when a piece gets sharp.
