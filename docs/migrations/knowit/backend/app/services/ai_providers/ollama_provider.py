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


class OllamaProvider(BaseAIProvider):
    name = "ollama"

    def __init__(self) -> None:
        self.base_url = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
        self.default_model = os.getenv("OLLAMA_MODEL", "llama3.2")
        self._client = httpx.Client(base_url=self.base_url)

    def info(self) -> ProviderInfo:
        health = self.health_check()
        return ProviderInfo(
            name=self.name,
            provider_type="ollama",
            display_name="Ollama",
            capabilities=ProviderCapabilities(
                supports_text_generation=True,
                supports_json_generation=True,
            ),
            enabled=health.available,
            is_local=True,
            sends_data_off_machine=False,
        )

    def health_check(self) -> ProviderHealth:
        try:
            payload = _get_json(self._client, "/api/tags", timeout=2)
        except ProviderError as exc:
            return ProviderHealth(
                provider_name=self.name,
                available=False,
                status="unavailable",
                message=str(exc),
            )

        model_count = len(payload.get("models", []))
        return ProviderHealth(
            provider_name=self.name,
            available=True,
            status="available",
            message=f"Ollama is reachable at {self.base_url}; {model_count} model(s) found.",
        )

    def generate_text(
        self,
        prompt: str,
        options: Mapping[str, Any] | None = None,
    ) -> str:
        model = str((options or {}).get("model") or self.default_model)
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
        }
        response = _post_json(
            self._client,
            "/api/generate",
            payload=payload,
            timeout=60,
        )
        generated = response.get("response")
        if not isinstance(generated, str):
            raise ProviderError("Ollama response did not include generated text")

        return generated

    def generate_json(
        self,
        prompt: str,
        schema: Mapping[str, Any],
        options: Mapping[str, Any] | None = None,
    ) -> Mapping[str, Any]:
        json_prompt = f"""Return only valid JSON. Do not wrap it in Markdown.

Schema:
{json.dumps(schema)}

Task:
{prompt}
"""
        generated = self.generate_text(json_prompt, options=options)
        try:
            return _parse_json_object(generated)
        except json.JSONDecodeError as exc:
            raise ProviderError("Ollama returned malformed JSON") from exc


def _get_json(client: httpx.Client, path: str, timeout: int) -> Mapping[str, Any]:
    try:
        response = client.get(path, timeout=timeout)
        response.raise_for_status()
        return _decode_json_response(response)
    except (httpx.HTTPError, json.JSONDecodeError) as exc:
        raise ProviderError(
            f"Ollama is not reachable at {client.base_url.join(path)}"
        ) from exc


def _post_json(
    client: httpx.Client,
    path: str,
    payload: Mapping[str, Any],
    timeout: int,
) -> Mapping[str, Any]:
    try:
        response = client.post(path, json=payload, timeout=timeout)
        response.raise_for_status()
        return _decode_json_response(response)
    except (httpx.HTTPError, json.JSONDecodeError) as exc:
        raise ProviderError(
            f"Ollama generation failed at {client.base_url.join(path)}"
        ) from exc


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
