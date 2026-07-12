# Architecture

## System Shape

```text
Frontend
  -> Backend API
    -> Research pipeline
      -> Paper source connectors
      -> Ranking services
      -> AI provider harness
      -> Storage
```

## Frontend

Responsibilities:

- topic input
- run progress
- paper table
- provider status
- paper detail view
- landscape view
- reading path

Recommended first stack:

```text
Next.js
TypeScript
Tailwind CSS
```

## Backend

Responsibilities:

- API routes
- research run lifecycle
- paper search
- ranking
- extraction
- synthesis
- provider selection
- persistence

Recommended first stack:

```text
Python
FastAPI
SQLite
```

## Research Pipeline

Pipeline stages:

```text
created
searching
ranking
extracting
synthesizing
complete
failed
```

Each stage should be testable separately.

## Provider Harness

The pipeline should call a stable internal interface instead of a specific AI vendor.

Interface:

```text
generate_text(prompt, options)
generate_json(prompt, schema, options)
embed_texts(texts, options)
rerank(query, documents, options)
health_check()
```

Provider-specific code belongs behind adapters.

Examples:

```text
OllamaProvider
MockProvider
OpenAICompatibleProvider
AnthropicProvider
GeminiProvider
BuiltInLocalProvider
```

## Paper Source Connectors

Each source should normalize results into the same paper shape.

Interface:

```text
search_papers(topic, options)
get_paper(source_id)
normalize_paper(raw_result)
```

Start with arXiv. Add OpenAlex and Semantic Scholar later.

## Storage

Start with SQLite.

Core tables:

```text
runs
papers
run_papers
paper_extractions
landscapes
ai_provider_settings
```

Later tables:

```text
topics
topic_snapshots
landscape_versions
local_documents
```

## Security Rules

- API keys never go in frontend code.
- Backend reads secrets from environment variables first.
- Local mode should not require any cloud key.
- If desktop packaging happens later, store keys in encrypted local storage or OS keychain.
