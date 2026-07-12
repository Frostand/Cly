# Project Brief

## Vision

Build a local-first research assistant that helps users map a research field without needing to pay for a hosted research platform.

The app should feel similar in spirit to Elicit: search papers, extract structured details, and synthesize research understanding. But the ownership model is different.

```text
Elicit: hosted paid platform
This project: local/private research harness
```

## Target User

Start with:

- ML students
- independent researchers
- builders learning a new technical field
- small friend groups who want a shared/free workflow
- users who already pay for ChatGPT, Claude, or another model and want to use that subscription/API inside a research workflow

## Core Problem

Research discovery is scattered:

- arXiv is good for search, but not synthesis.
- Generic chatbots can explain papers, but do not manage research workflows.
- Elicit-like tools are useful, but paid and hosted.
- Local models are private, but need a harness around them.

This project connects those pieces.

## Product Bet

We do not win by having the largest corpus on day one.

We win by offering:

- local/private operation
- bring-your-own-model flexibility
- transparent ranking and extraction
- ML-first paper workflows
- an app users can modify

## First Real MVP

The first meaningful version should:

1. Accept a research topic.
2. Search arXiv.
3. Rank papers with a simple baseline.
4. Use a mock provider or Ollama to extract structured notes from top papers.
5. Synthesize a basic research landscape.
6. Show the results in a simple frontend.

## Non-Goals For The MVP

- Beat Elicit's full paper corpus.
- Build clinical systematic-review compliance.
- Parse every PDF perfectly.
- Host a free public cloud service.
- Build a beautiful graph UI immediately.
- Ship a bundled model in the first version.

## Success Criteria

The MVP succeeds if a user can run it locally, search an ML topic, and get a useful paper list plus a basic field summary without paying for the app itself.
