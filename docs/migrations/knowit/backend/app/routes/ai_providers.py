from fastapi import APIRouter, HTTPException, status

from app.models.ai_providers import (
    ProviderHealth,
    ProviderInfo,
    ProviderSetting,
    ProviderTestRequest,
    ProviderTestResponse,
)
from app.services.ai_providers.base import (
    ProviderCapabilityError,
    ProviderError,
    ProviderNotFoundError,
)
from app.services.ai_providers.registry import get_provider, list_providers
from app.storage.repositories import list_provider_settings


router = APIRouter(prefix="/ai", tags=["ai providers"])


@router.get("/providers", response_model=list[ProviderInfo])
def get_ai_providers() -> list[ProviderInfo]:
    return [provider.info() for provider in list_providers()]


@router.get("/provider-settings", response_model=list[ProviderSetting])
def get_ai_provider_settings() -> list[ProviderSetting]:
    return list_provider_settings()


@router.get("/providers/{provider_name}/health", response_model=ProviderHealth)
def get_ai_provider_health(provider_name: str) -> ProviderHealth:
    try:
        provider = get_provider(provider_name)
    except ProviderNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return provider.health_check()


@router.post("/providers/test", response_model=ProviderTestResponse)
def test_ai_provider(request: ProviderTestRequest) -> ProviderTestResponse:
    try:
        provider = get_provider(request.provider_name)
        output = provider.generate_text(request.prompt, options={})
    except ProviderNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except ProviderCapabilityError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except ProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    return ProviderTestResponse(
        provider_name=provider.name,
        output_type="text",
        output=output,
        sends_data_off_machine=provider.info().sends_data_off_machine,
    )
