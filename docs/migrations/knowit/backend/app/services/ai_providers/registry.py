from app.services.ai_providers.base import BaseAIProvider, ProviderNotFoundError
from app.services.ai_providers.anthropic_provider import AnthropicProvider
from app.services.ai_providers.mock_provider import MockProvider
from app.services.ai_providers.ollama_provider import OllamaProvider
from app.services.ai_providers.openai_provider import OpenAIProvider


_PROVIDERS: dict[str, BaseAIProvider] = {
    "anthropic": AnthropicProvider(),
    "mock": MockProvider(),
    "ollama": OllamaProvider(),
    "openai": OpenAIProvider(),
}


def list_providers() -> list[BaseAIProvider]:
    return [_PROVIDERS[name] for name in sorted(_PROVIDERS)]


def get_provider(provider_name: str) -> BaseAIProvider:
    normalized_name = provider_name.strip().lower()
    provider = _PROVIDERS.get(normalized_name)
    if provider is None:
        raise ProviderNotFoundError(f"AI provider '{provider_name}' is not registered")

    return provider
