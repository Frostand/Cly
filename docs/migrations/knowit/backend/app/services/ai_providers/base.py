from abc import ABC, abstractmethod
from collections.abc import Mapping, Sequence
from typing import Any

from app.models.ai_providers import ProviderHealth, ProviderInfo


class ProviderError(Exception):
    pass


class ProviderNotFoundError(ProviderError):
    pass


class ProviderCapabilityError(ProviderError):
    pass


class BaseAIProvider(ABC):
    name: str

    @abstractmethod
    def info(self) -> ProviderInfo:
        raise NotImplementedError

    @abstractmethod
    def health_check(self) -> ProviderHealth:
        raise NotImplementedError

    def generate_text(
        self,
        prompt: str,
        options: Mapping[str, Any] | None = None,
    ) -> str:
        raise ProviderCapabilityError(
            f"Provider '{self.name}' does not support text generation"
        )

    def generate_json(
        self,
        prompt: str,
        schema: Mapping[str, Any],
        options: Mapping[str, Any] | None = None,
    ) -> Mapping[str, Any]:
        raise ProviderCapabilityError(
            f"Provider '{self.name}' does not support JSON generation"
        )

    def embed_texts(
        self,
        texts: Sequence[str],
        options: Mapping[str, Any] | None = None,
    ) -> list[list[float]]:
        raise ProviderCapabilityError(f"Provider '{self.name}' does not support embeddings")

    def rerank(
        self,
        query: str,
        documents: Sequence[str],
        options: Mapping[str, Any] | None = None,
    ) -> list[int]:
        raise ProviderCapabilityError(f"Provider '{self.name}' does not support reranking")
