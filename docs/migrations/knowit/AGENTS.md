# Agent Safety and Privacy Rules

These rules apply to all work in this repository.

## Core Principle

This project is local-first and privacy-conscious. Treat user topics, paper notes, extracted summaries, API keys, provider settings, and local files as private by default.

## API Keys and Secrets

- Never put API keys, tokens, subscription credentials, or provider secrets in frontend code.
- Never commit real keys to the repository.
- Prefer environment variables for secrets.
- Use `.env.example` files only for placeholder names, never real values.
- Do not print secrets in logs, test output, error messages, screenshots, or generated docs.
- If a key is needed, ask the user to provide it through a safe local mechanism.

## AI Provider Safety

- The backend must call AI providers through a provider interface, not scattered provider-specific code.
- Clearly separate local providers from cloud providers.
- Before adding a cloud provider call, make it obvious in code and UI that data may leave the user's machine.
- Support a mock provider first so development and testing do not require paid APIs or sending data externally.
- Do not silently fall back from a local provider to a cloud provider.
- Provider health checks must not send private research content.

## Data Privacy

- Store research runs, topics, paper notes, extraction results, and synthesis results locally unless the user explicitly chooses otherwise.
- Avoid collecting analytics, telemetry, or remote logs by default.
- Do not send full papers, PDFs, local documents, or extracted notes to cloud AI unless the user has explicitly selected a cloud provider.
- Keep logs minimal. Log operational state, not private content.
- Redact or omit user topics and prompts in logs unless needed for local debugging.

## Frontend and Backend Boundary

- The frontend may display provider status and selected provider names.
- The frontend must not receive API keys or raw secret values.
- Any provider configuration involving secrets belongs in the backend or secure local storage.
- CORS changes should be narrow and intentional.

## Research Output Safety

- Clearly distinguish paper metadata, model-generated summaries, and synthesized conclusions.
- Do not present model output as verified truth.
- Preserve enough source references for users to inspect original papers.
- Prefer transparent ranking explanations over opaque scores.

## Development Defaults

- Default to local-only behavior.
- Default to the mock provider until a real provider is intentionally configured.
- Default to arXiv/open metadata before adding broader sources.
- Default to in-memory or local SQLite storage before hosted databases.

## Before Implementing New Features

Ask these questions:

1. Does this feature send user data outside the machine?
2. Does it expose any secret to the frontend, logs, or repository?
3. Is the user clearly aware when a cloud provider is used?
4. Can this be tested with a mock provider first?
5. Is private research content stored locally by default?

If the answer is uncertain, stop and clarify before implementing.

