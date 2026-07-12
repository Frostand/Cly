# Built-In Local Model Mode

**Branch:** `feature/built-in-local-model`

## What

One-click setup to download and run a small local model (via Ollama) suitable for extraction and synthesis — no manual Ollama configuration needed.

## Why

Ollama is already supported, but requires users to install Ollama separately and pull a model. A built-in mode could download a quantized model automatically and use it for extractions — making the app truly zero-config local.

## How to Implement

1. **Model recommendation engine**
   - Based on available RAM, recommend a model size: 1B, 3B, 7B, 13B
   - Recommend specific models: `llama3.2:3b` for 8GB RAM, `llama3.2:1b` for 4GB
   - Show estimated download size and extraction speed

2. **Auto-download via Ollama**
   - `POST /api/v1/local-model/setup` — checks Ollama is running, pulls recommended model
   - Stream progress to frontend (SSE: "downloading", "verifying", "ready")
   - Handle Ollama not installed: show setup link/instructions

3. **Model management UI**
   - List installed models, their sizes, and capabilities
   - "Download model" button with model selector
   - "Set as default" for extraction/synthesis/embeddings independently
   - Delete unused models to free disk space

4. **Provider configuration**
   - Ollama provider already has `default_model` — make it configurable per task
   - `OLLAMA_EXTRACTION_MODEL`, `OLLAMA_SYNTHESIS_MODEL`, `OLLAMA_EMBEDDING_MODEL` env vars
   - Or persistent settings in the provider settings table

5. **Performance estimates**
   - Show estimated extraction time per paper based on model size and hardware
   - "~30s per paper with llama3.2:3b on M1" style estimates

## When You Know It's Done

- [ ] Can trigger model download from the frontend
- [ ] Progress is streamed during download
- [ ] Downloaded model is automatically configured as the default
- [ ] Model management UI shows installed and available models
- [ ] Extraction and synthesis work with the locally downloaded model
- [ ] Graceful handling when Ollama is not installed

## Expected Results

Click "Setup Local Model" → app detects 16GB RAM → recommends `llama3.2:3b` → download starts with progress bar → 2 minutes later → "Ready!" → next research run uses the local model for extraction.

## Dependencies

- Ollama provider already exists in `ollama_provider.py`

## Files to Touch

```
backend/app/routes/local_model.py                (new)
backend/app/services/ai_providers/ollama_provider.py  (model management)
frontend/app/components/ModelManager.tsx          (new)
frontend/app/page.tsx                             (setup flow)
```
