# AI Provider Strategy

## Goal

The app should be an AI harness.

Users should be able to choose:

```text
local AI
built-in/local project model
their own cloud API key
```

The research workflow should not be locked to one vendor.

## Provider Modes

### Mock Provider

Purpose:

- test the pipeline
- develop without a model
- avoid API costs
- make demos deterministic

Build this first.

### Ollama Provider

Purpose:

- local generation
- private extraction
- free local use after model download

This should be the first real AI provider.

### Built-In Local Provider

Purpose:

- eventually let users run the app without separately configuring Ollama

This is advanced.

Possible implementation:

```text
download recommended GGUF model
run through llama.cpp
offer Basic/Balanced/Research presets
```

Build this after the app already works with Ollama.

### OpenAI-Compatible Provider

Purpose:

- let users bring an API key
- support OpenAI and compatible gateways
- support local OpenAI-compatible servers

This can also cover OpenRouter-style workflows.

### Claude/Gemini Providers

Purpose:

- support users who already pay for those ecosystems
- improve synthesis quality when local models are not enough

Add after the generic provider interface is stable.

## Provider Capabilities

Each provider should declare what it can do:

```text
supports_text_generation
supports_json_generation
supports_embeddings
supports_reranking
supports_streaming
supports_long_context
```

The pipeline should check capabilities before using a provider.

## Provider Interface

The app should call:

```text
generate_text(prompt, options)
generate_json(prompt, schema, options)
embed_texts(texts, options)
rerank(query, documents, options)
health_check()
```

The app should not call provider-specific APIs throughout the codebase.

## Provider Selection

Suggested settings:

```text
provider_type
provider_name
base_url
model_name
api_key_reference
max_context_tokens
enabled
```

## Security

Rules:

- never expose API keys to the frontend
- prefer environment variables first
- support local-only mode without any API key
- clearly label cloud calls so users know when data leaves their machine

## Local Model Reality Check

Local models can be useful, but quality depends on hardware.

Expected presets:

```text
Basic: lower RAM, faster, weaker synthesis
Balanced: moderate RAM, better extraction
Research: stronger model, slower, needs more RAM/VRAM
```

The app should degrade gracefully:

```text
fewer papers
shorter prompts
abstract-only extraction
chunked synthesis
mock provider fallback
```
