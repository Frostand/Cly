from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from app.models.extractions import RunExtractionsResponse
from app.models.landscapes import RunLandscapeResponse
from app.models.papers import RunPapersResponse
from app.models.runs import CreateRunRequest, ResearchRun, RunStatus, StartRunRequest
from app.pipeline.research_pipeline import run_research_pipeline
from app.routes.ai_providers import router as ai_providers_router
from app.routes.folders import router as folders_router
from app.routes.search import router as search_router
from app.services.ai_providers.registry import list_providers
from app.storage.database import init_database
from app.storage.repositories import (
    get_extractions_for_run,
    get_landscape_for_run,
    get_ranked_papers_for_run,
    get_run_by_id,
    save_run,
    sync_provider_settings,
)


app = FastAPI(title="Local Research Field Mapper API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "http://127.0.0.1:3001",
        "http://localhost:3001",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
)

init_database()
sync_provider_settings(list_providers())

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(ai_providers_router)
api_router.include_router(folders_router)
api_router.include_router(search_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@api_router.post("/runs", response_model=ResearchRun, status_code=status.HTTP_201_CREATED)
def create_run(request: CreateRunRequest) -> ResearchRun:
    now = datetime.now(timezone.utc)
    run = ResearchRun(
        run_id=str(uuid4()),
        topic=request.topic.strip(),
        status=RunStatus.CREATED,
        current_stage=RunStatus.CREATED,
        created_at=now,
        updated_at=now,
    )
    save_run(run)
    return run


@api_router.get("/runs/{run_id}", response_model=ResearchRun)
def get_run(run_id: str) -> ResearchRun:
    run = get_run_by_id(run_id)
    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research run not found",
        )
    return run


@api_router.post("/runs/{run_id}/start", response_model=ResearchRun)
def start_run(
    run_id: str,
    request: StartRunRequest,
    background_tasks: BackgroundTasks,
) -> ResearchRun:
    run = get_run_by_id(run_id)
    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research run not found",
        )

    background_tasks.add_task(
        run_research_pipeline,
        run_id=run_id,
        max_results=request.max_results,
        provider_name=request.provider_name,
        paper_source=request.paper_source,
    )
    return run


@api_router.get("/runs/{run_id}/papers", response_model=RunPapersResponse)
def get_run_papers(run_id: str) -> RunPapersResponse:
    run = get_run_by_id(run_id)
    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research run not found",
        )

    return RunPapersResponse(
        run_id=run_id,
        papers=get_ranked_papers_for_run(run_id),
    )


@api_router.get("/runs/{run_id}/extractions", response_model=RunExtractionsResponse)
def get_run_extractions(run_id: str) -> RunExtractionsResponse:
    run = get_run_by_id(run_id)
    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research run not found",
        )

    return RunExtractionsResponse(
        run_id=run_id,
        extractions=get_extractions_for_run(run_id),
    )


@api_router.get("/runs/{run_id}/landscape", response_model=RunLandscapeResponse)
def get_run_landscape(run_id: str) -> RunLandscapeResponse:
    run = get_run_by_id(run_id)
    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research run not found",
        )

    return RunLandscapeResponse(
        run_id=run_id,
        landscape=get_landscape_for_run(run_id),
    )


app.include_router(api_router)
