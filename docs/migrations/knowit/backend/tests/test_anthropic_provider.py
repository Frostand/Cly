import unittest
from unittest.mock import Mock

import httpx

from app.services.ai_providers.anthropic_provider import AnthropicProvider
from app.services.ai_providers.base import ProviderError


class AnthropicProviderTest(unittest.TestCase):
    def test_health_check_reports_not_configured_without_api_key(self) -> None:
        provider = AnthropicProvider()
        provider.api_key = ""

        health = provider.health_check()

        self.assertFalse(health.available)
        self.assertEqual(health.status, "not_configured")
        self.assertIn("ANTHROPIC_API_KEY", health.message)

    def test_health_check_uses_models_endpoint_without_research_content(self) -> None:
        provider = AnthropicProvider()
        provider.api_key = "sk-ant-test"
        provider._client = Mock()
        provider._client.get.return_value = httpx.Response(
            200,
            json={"data": [{"id": "claude-3-5-haiku-latest"}]},
            request=httpx.Request("GET", f"{provider.base_url}/v1/models"),
        )

        health = provider.health_check()

        self.assertTrue(health.available)
        self.assertEqual(health.status, "available")
        provider._client.get.assert_called_once()
        self.assertNotIn("private research topic", str(provider._client.get.call_args))
        self.assertNotIn("paper abstract", str(provider._client.get.call_args))

    def test_generate_json_uses_assistant_prefill_and_parses_response(self) -> None:
        provider = AnthropicProvider()
        provider.api_key = "sk-ant-test"
        provider._client = Mock()
        provider._client.post.return_value = httpx.Response(
            200,
            json={
                "content": [
                    {"type": "text", "text": '"problem":"test problem"}'}
                ]
            },
            request=httpx.Request("POST", f"{provider.base_url}/v1/messages"),
        )

        output = provider.generate_json(
            prompt="Extract from this abstract.",
            schema={"type": "object"},
        )

        self.assertEqual(output["problem"], "test problem")
        request_payload = provider._client.post.call_args.kwargs["json"]
        self.assertEqual(request_payload["messages"][1]["content"], "{")

    def test_generate_text_raises_clear_error_for_invalid_key(self) -> None:
        provider = AnthropicProvider()
        provider.api_key = "sk-ant-test"
        provider._client = Mock()
        provider._client.post.return_value = httpx.Response(
            401,
            json={"error": {"message": "bad key"}},
            request=httpx.Request("POST", f"{provider.base_url}/v1/messages"),
        )

        with self.assertRaisesRegex(ProviderError, "invalid API key"):
            provider.generate_text("summarize this")

    def test_generate_text_includes_retry_after_for_rate_limits(self) -> None:
        provider = AnthropicProvider()
        provider.api_key = "sk-ant-test"
        provider._client = Mock()
        provider._client.post.return_value = httpx.Response(
            429,
            headers={"retry-after": "12"},
            json={"error": {"message": "rate limited"}},
            request=httpx.Request("POST", f"{provider.base_url}/v1/messages"),
        )

        with self.assertRaisesRegex(ProviderError, "retry after 12 seconds"):
            provider.generate_text("summarize this")


if __name__ == "__main__":
    unittest.main()
