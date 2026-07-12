from typing import Any

from pydantic import BaseModel, Field


class ProviderCapabilities(BaseModel):
    supports_text_generation: bool = False
    supports_json_generation: bool = False
    supports_embeddings: bool = False
    supports_reranking: bool = False
    supports_streaming: bool = False
    supports_long_context: bool = False


class ProviderInfo(BaseModel):
    name: str
    provider_type: str
    display_name: str
    capabilities: ProviderCapabilities
    enabled: bool
    is_local: bool
    sends_data_off_machine: bool


class ProviderHealth(BaseModel):
    provider_name: str
    available: bool
    status: str
    message: str


class ProviderTestRequest(BaseModel):
    provider_name: str = "mock"
    prompt: str = Field(default="Summarize this test request.", min_length=1)


class ProviderTestResponse(BaseModel):
    provider_name: str
    output_type: str
    output: Any
    sends_data_off_machine: bool


class ProviderSetting(BaseModel):
    provider_name: str
    provider_type: str
    base_url: str | None = None
    model_name: str | None = None
    api_key_reference: str | None = None
    max_context_tokens: int | None = None
    enabled: bool
    updated_at: str
