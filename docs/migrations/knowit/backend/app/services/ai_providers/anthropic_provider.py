import json
import os
from collections.abc import Mapping
from typing import Any

import httpx

from app.models.ai_providers import (
    ProviderCapabilities,
    ProviderHealth,
    ProviderInfo,
)
from app.services.ai_providers.base import BaseAIProvider, ProviderError


class AnthropicProvider(BaseAIProvider):
    name = "anthropic"
    max_abstract_chars = 1500

    def __init__(self) -> None:
        self.api_key = os.getenv("ANTHROPIC_API_KEY", "")
        self.base_url = os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com").rstrip("/")
        self.default_model = os.getenv("ANTHROPIC_MODEL", "claude-3-5-haiku-latest")
        self.api_version = os.getenv("ANTHROPIC_VERSION", "2023-06-01")
        self._client = httpx.Client(base_url=self.base_url)

    def info(self) -> ProviderInfo:
        health = self.health_check()
        return ProviderInfo(
            name=self.name,
            provider_type="anthropic",
            display_name="Claude",
            capabilities=ProviderCapabilities(
                supports_text_generation=True,
                supports_json_generation=True,
            ),
            enabled=health.available,
            is_local=False,
            sends_data_off_machine=True,
        )

    def health_check(self) -> ProviderHealth:
        if not self.api_key:
            return ProviderHealth(
                provider_name=self.name,
                available=False,
                status="not_configured",
                message="Anthropic API key is not configured. Set ANTHROPIC_API_KEY in the backend environment.",
            )

        try:
            response = self._client.get("/v1/models", headers=self._headers(), timeout=5)
            if response.status_code >= 400:
                raise _provider_error_from_response("Anthropic", response, "health check")
            payload = _decode_json_response(response)
        except ProviderError as exc:
            return ProviderHealth(
                provider_name=self.name,
                available=False,
                status=_health_status_from_error(str(exc)),
                message=str(exc),
            )
        except (httpx.HTTPError, json.JSONDecodeError) as exc:
            return ProviderHealth(
                provider_name=self.name,
                available=False,
                status="unavailable",
                message="Anthropic health check failed before sending any research content.",
            )

        model_count = len(payload.get("data", []))
        return ProviderHealth(
            provider_name=self.name,
            available=True,
            status="available",
            message=f"Anthropic is reachable; {model_count} model(s) found. Cloud runs send topics, paper abstracts, and parsed paper text when available to Anthropic.",
        )

    def generate_text(
        self,
        prompt: str,
        options: Mapping[str, Any] | None = None,
    ) -> str:
        options = options or {}
        return self._create_message(
            system_prompt=str(
                options.get("system")
                or "You extract and synthesize research metadata. Be concise and cite only supplied content."
            ),
            messages=[{"role": "user", "content": prompt}],
            model=str(options.get("model") or self.default_model),
            max_tokens=int(options.get("max_tokens", 1200)),
            temperature=float(options.get("temperature", 0.1)),
        )

    def generate_json(
        self,
        prompt: str,
        schema: Mapping[str, Any],
        options: Mapping[str, Any] | None = None,
    ) -> Mapping[str, Any]:
        options = options or {}
        system_prompt = f"""Return only a single valid JSON object. Do not wrap it in Markdown.

The JSON object must match this schema:
{json.dumps(schema, separators=(",", ":"))}
"""
        generated = self._create_message(
            system_prompt=system_prompt,
            messages=[
                {"role": "user", "content": prompt},
                {"role": "assistant", "content": "{"},
            ],
            model=str(options.get("model") or self.default_model),
            max_tokens=int(options.get("max_tokens", 1400)),
            temperature=float(options.get("temperature", 0.1)),
        )
        candidate = generated.strip()
        if not candidate.startswith("{"):
            candidate = "{" + candidate

        try:
            return _parse_json_object(candidate)
        except json.JSONDecodeError as exc:
            raise ProviderError("Anthropic returned malformed JSON") from exc

    def _create_message(
        self,
        system_prompt: str,
        messages: list[Mapping[str, str]],
        model: str,
        max_tokens: int,
        temperature: float,
    ) -> str:
        if not self.api_key:
            raise ProviderError("Anthropic API key is not configured. Set ANTHROPIC_API_KEY in the backend environment.")

        payload: dict[str, Any] = {
            "model": model,
            "system": system_prompt,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        try:
            response = self._client.post(
                "/v1/messages",
                headers=self._headers(),
                json=payload,
                timeout=60,
            )
            if response.status_code >= 400:
                raise _provider_error_from_response("Anthropic", response, "generation")
            payload = _decode_json_response(response)
        except ProviderError:
            raise
        except (httpx.HTTPError, json.JSONDecodeError) as exc:
            raise ProviderError("Anthropic generation failed without exposing request content") from exc

        content_blocks = payload.get("content")
        if not isinstance(content_blocks, list):
            raise ProviderError("Anthropic response did not include generated text")

        generated = "".join(
            block.get("text", "")
            for block in content_blocks
            if isinstance(block, dict) and block.get("type") == "text"
        )
        if not generated:
            raise ProviderError("Anthropic response did not include generated text")

        return generated

    def _headers(self) -> dict[str, str]:
        return {
            "x-api-key": self.api_key,
            "anthropic-version": self.api_version,
            "Content-Type": "application/json",
        }


def _provider_error_from_response(
    provider_name: str,
    response: httpx.Response,
    action: str,
) -> ProviderError:
    if response.status_code == 401:
        return ProviderError(f"{provider_name} {action} failed: invalid API key")
    if response.status_code == 429:
        retry_after = response.headers.get("retry-after")
        suffix = f"; retry after {retry_after} seconds" if retry_after else ""
        return ProviderError(f"{provider_name} {action} failed: rate limited{suffix}")
    if response.status_code >= 500:
        return ProviderError(
            f"{provider_name} {action} failed: provider server error {response.status_code}"
        )

    return ProviderError(
        f"{provider_name} {action} failed: HTTP {response.status_code}"
    )


def _health_status_from_error(message: str) -> str:
    lowered = message.lower()
    if "invalid api key" in lowered:
        return "invalid_api_key"
    if "rate limited" in lowered:
        return "rate_limited"
    return "unavailable"


def _decode_json_response(response: httpx.Response) -> Mapping[str, Any]:
    payload = response.json()
    if not isinstance(payload, dict):
        raise json.JSONDecodeError("Expected JSON object", response.text, 0)

    return payload


def _parse_json_object(value: str) -> Mapping[str, Any]:
    stripped = value.strip()
    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError:
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        parsed = json.loads(stripped[start : end + 1])

    if not isinstance(parsed, dict):
        raise json.JSONDecodeError("Expected JSON object", stripped, 0)

    return parsed
