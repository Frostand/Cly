from datetime import datetime

from pydantic import BaseModel


class LandscapeDraft(BaseModel):
    overview: str
    clusters: list[str]
    relationships: list[str]
    tensions: list[str]
    open_problems: list[str]
    recommended_reading_path: list[str]


class Landscape(LandscapeDraft):
    run_id: str
    provider_name: str
    created_at: datetime


class RunLandscapeResponse(BaseModel):
    run_id: str
    landscape: Landscape | None = None
