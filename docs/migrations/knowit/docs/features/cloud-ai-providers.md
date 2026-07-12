# Cloud AI Providers (ChatGPT + Claude)

**Branch:** `feature/cloud-ai-providers`

## What

Add OpenAI (ChatGPT) and Anthropic (Claude) as AI providers so users can use their own API subscriptions for paper extraction and landscape synthesis.

## Why

The mock provider gives deterministic output but no real insight. Ollama requires local setup. Many researchers already have ChatGPT/Claude subscriptions — letting them use those keys gives high-quality extractions immediately.

## Privacy Warning ⚠️

Per `AGENTS.md`: cloud providers send data off the user's machine. The UI and code must make this obvious. Never silently switch to cloud. Default stays `mock`.

## How to Implement

### Backend

1. **`OpenAIProvider`** — `app/services/ai_providers/openai_provider.py`
   ```python
   class OpenAIProvider(BaseAIProvider):
       name = "openai"

       def __init__(self):
           self.api_key = os.getenv("OPENAI_API_KEY", "")
           self.base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
           self.default_model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
   ```
   - `health_check()`: lightweight models list call (no content sent)
   - `generate_text()`: POST to `/chat/completions` with system/user messages
   - `generate_json()`: use `response_format: {"type": "json_object"}` + schema in system prompt
   - Handle API errors: 401 (bad key), 429 (rate limit), 5xx (server error)
   - Use `httpx` (consistent with #3 fix for Ollama)

2. **`AnthropicProvider`** — `app/services/ai_providers/anthropic_provider.py`
   ```python
   class AnthropicProvider(BaseAIProvider):
       name = "anthropic"

       def __init__(self):
           self.api_key = os.getenv("ANTHROPIC_API_KEY", "")
           self.base_url = os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com")
           self.default_model = os.getenv("ANTHROPIC_MODEL", "claude-3-5-haiku-latest")
   ```
   - `health_check()`: models list call
   - `generate_text()`: POST to `/v1/messages` with Messages API
   - `generate_json()`: similar approach — system prompt with schema, parse JSON from response
   - Anthropic doesn't have native JSON mode; use `prefill: "{"` trick or parse from text

3. **Register in `registry.py`**:
   ```python
   _PROVIDERS = {
       "mock": MockProvider(),
       "ollama": OllamaProvider(),
       "openai": OpenAIProvider(),
       "anthropic": AnthropicProvider(),
   }
   ```

4. **API key security:**
   - Keys come from environment variables only — NEVER hardcoded, NEVER sent to frontend
   - `ProviderInfo` already has `sends_data_off_machine: bool` — set `True` for both
   - Provider test endpoint: mask key in responses, show last 4 chars only
   - Health check must NOT send research content — just list models

5. **Extraction prompt optimization for cloud:**
   - Cloud providers charge per token — be efficient
   - Truncate abstract to 1500 chars for cloud (local can use full)
   - Add a `max_prompt_chars` config per provider

### Frontend

6. **Provider selector with warnings** (builds on #6 if done):
   - Cloud providers show ⚠️ icon and "Sends data to OpenAI/Anthropic" note
   - Selecting a cloud provider shows a one-time confirmation dialog:
     > "ChatGPT/Claude will receive your research topic and paper abstracts.
     > Are you sure you want to use a cloud provider?"
   - Show estimated cost for the run (tokens × pricing)
   - Remember preference in `localStorage` ("I understand") to skip dialog next time

7. **Provider status indicators:**
   - Green dot: available
   - Yellow dot: available but cloud (sends data off machine)
   - Red dot: unavailable (bad key, no network, rate limited)
   - Gray dot: not configured (no API key set)

8. **API key setup guide:**
   - Link to OpenAI/Anthropic API key pages
   - `.env.example` updated with placeholder names:
     ```
     OPENAI_API_KEY=sk-...
     ANTHROPIC_API_KEY=sk-ant-...
     ```

### New Dependencies

Add to `requirements.txt`:
```
httpx>=0.28.0
```

(Remove if already added by Ollama migration in #3)

## When You Know It's Done

- [ ] OpenAI provider generates real extraction text with a valid key
- [ ] Anthropic provider generates real extraction text with a valid key
- [ ] Both providers pass health check without sending research content
- [ ] Invalid API keys show clear error messages (not generic "provider failed")
- [ ] 429 rate limits are handled with retry-after
- [ ] Frontend shows cloud warning when selecting OpenAI/Anthropic
- [ ] `sends_data_off_machine: true` in provider info
- [ ] Default provider is still `mock` — cloud is opt-in
- [ ] Frontend never receives API keys
- [ ] Tests: `test_openai_provider.py` (with mock HTTP), `test_anthropic_provider.py`
- [ ] Tests: verify health check doesn't leak topic/prompt content

## Expected Results

User sets `OPENAI_API_KEY=sk-abc123` in `.env` → starts backend → frontend shows "ChatGPT" in provider list with ⚠️ badge → selects it → confirmation dialog → runs a search → extraction notes are genuinely useful LLM output, not mock text.

## Dependencies

- None (uses existing `BaseAIProvider` interface)
- #3 (httpx migration) is complementary — do that first so both use the same HTTP library

## Files to Touch

```
backend/app/services/ai_providers/openai_provider.py     (new)
backend/app/services/ai_providers/anthropic_provider.py   (new)
backend/app/services/ai_providers/registry.py             (register both)
backend/requirements.txt                                  (add httpx if not already)
.env.example                                              (add key placeholders)
frontend/app/page.tsx                                     (cloud warnings, confirmation)
frontend/app/globals.css                                  (cloud badge styles)
backend/tests/test_openai_provider.py                     (new)
backend/tests/test_anthropic_provider.py                  (new)
```
