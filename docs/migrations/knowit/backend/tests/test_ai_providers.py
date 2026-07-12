import unittest
from unittest.mock import Mock

import httpx

from app.services.ai_providers.base import ProviderError, ProviderNotFoundError
from app.services.ai_providers.ollama_provider import OllamaProvider
from app.services.ai_providers.registry import get_provider, list_providers


class AIProviderTest(unittest.TestCase):
    def test_registry_contains_expected_providers(self) -> None:
        provider_names = {provider.name for provider in list_providers()}

        self.assertIn("anthropic", provider_names)
        self.assertIn("mock", provider_names)
        self.assertIn("ollama", provider_names)
        self.assertIn("openai", provider_names)

    def test_unknown_provider_raises(self) -> None:
        with self.assertRaises(ProviderNotFoundError):
            get_provider("unknown")

    def test_mock_provider_is_local_and_does_not_echo_prompt(self) -> None:
        provider = get_provider("mock")
        info = provider.info()
        output = provider.generate_text("private research topic")

        self.assertTrue(info.is_local)
        self.assertFalse(info.sends_data_off_machine)
        self.assertNotIn("private research topic", output)

    def test_mock_provider_health_is_available(self) -> None:
        provider = get_provider("mock")
        health = provider.health_check()

        self.assertTrue(health.available)
        self.assertEqual(health.status, "available")

    def test_ollama_info_enabled_false_when_unreachable(self) -> None:
        provider = OllamaProvider()
        provider._client = Mock()
        provider._client.base_url = httpx.URL(provider.base_url)
        provider._client.get.side_effect = httpx.ConnectError(
            "connection refused",
            request=httpx.Request("GET", f"{provider.base_url}/api/tags"),
        )

        info = provider.info()

        self.assertFalse(info.enabled)

    def test_ollama_health_check_available_when_reachable(self) -> None:
        provider = OllamaProvider()
        provider._client = Mock()
        provider._client.base_url = httpx.URL(provider.base_url)
        provider._client.get.return_value = httpx.Response(
            200,
            json={"models": [{"name": "llama3.2"}]},
            request=httpx.Request("GET", f"{provider.base_url}/api/tags"),
        )

        health = provider.health_check()

        self.assertTrue(health.available)
        self.assertEqual(health.status, "available")
        self.assertIn("1 model(s) found", health.message)

    def test_ollama_generate_text_uses_httpx_client(self) -> None:
        provider = OllamaProvider()
        provider._client = Mock()
        provider._client.base_url = httpx.URL(provider.base_url)
        provider._client.post.return_value = httpx.Response(
            200,
            json={"response": "generated output"},
            request=httpx.Request("POST", f"{provider.base_url}/api/generate"),
        )

        output = provider.generate_text("summarize this")

        self.assertEqual(output, "generated output")
        provider._client.post.assert_called_once()

    def test_ollama_generate_text_raises_provider_error_on_http_failure(self) -> None:
        provider = OllamaProvider()
        provider._client = Mock()
        provider._client.base_url = httpx.URL(provider.base_url)
        provider._client.post.side_effect = httpx.ConnectError(
            "connection refused",
            request=httpx.Request("POST", f"{provider.base_url}/api/generate"),
        )

        with self.assertRaises(ProviderError):
            provider.generate_text("summarize this")


if __name__ == "__main__":
    unittest.main()
