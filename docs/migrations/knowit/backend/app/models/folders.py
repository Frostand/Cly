from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.papers import Paper


FOLDER_NAME_MAX_LENGTH = 120


class Folder(BaseModel):
    folder_id: str
    name: str
    created_at: datetime
    updated_at: datetime
    paper_count: int = 0


class FolderPaper(BaseModel):
    paper: Paper
    added_at: datetime


class FolderWithPapers(BaseModel):
    folder: Folder
    papers: list[FolderPaper]


class _FolderNameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=FOLDER_NAME_MAX_LENGTH)

    @field_validator("name")
    @classmethod
    def strip_and_validate_name(cls, value: str) -> str:
        stripped_value = value.strip()
        if not stripped_value:
            raise ValueError("Folder name cannot be blank")
        return stripped_value


class CreateFolderRequest(_FolderNameRequest):
    pass


class RenameFolderRequest(_FolderNameRequest):
    pass


class AddPaperToFolderRequest(BaseModel):
    paper_id: str = Field(min_length=1)
