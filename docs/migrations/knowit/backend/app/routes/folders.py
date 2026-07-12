from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

from app.models.folders import (
    AddPaperToFolderRequest,
    CreateFolderRequest,
    Folder,
    FolderWithPapers,
    RenameFolderRequest,
)
from app.storage.repositories import (
    FolderNotFoundError,
    PaperNotFoundError,
    add_paper_to_folder,
    delete_folder,
    get_folder_with_papers,
    get_folders,
    remove_paper_from_folder,
    rename_folder,
    save_folder,
)


router = APIRouter(prefix="/folders", tags=["folders"])


@router.post("", response_model=Folder, status_code=status.HTTP_201_CREATED)
def create_folder(request: CreateFolderRequest) -> Folder:
    now = datetime.now(timezone.utc)
    folder = Folder(
        folder_id=str(uuid4()),
        name=request.name,
        created_at=now,
        updated_at=now,
    )
    save_folder(folder)
    return folder


@router.get("", response_model=list[Folder])
def list_folders() -> list[Folder]:
    return get_folders()


@router.get("/{folder_id}", response_model=FolderWithPapers)
def get_folder(folder_id: str) -> FolderWithPapers:
    folder = get_folder_with_papers(folder_id)
    if folder is None:
        raise _folder_not_found()
    return folder


@router.put("/{folder_id}", response_model=Folder)
def update_folder(folder_id: str, request: RenameFolderRequest) -> Folder:
    try:
        return rename_folder(folder_id, request.name)
    except FolderNotFoundError as exc:
        raise _folder_not_found() from exc


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_folder(folder_id: str) -> None:
    try:
        delete_folder(folder_id)
    except FolderNotFoundError as exc:
        raise _folder_not_found() from exc


@router.post("/{folder_id}/papers", response_model=FolderWithPapers)
def add_folder_paper(
    folder_id: str,
    request: AddPaperToFolderRequest,
) -> FolderWithPapers:
    try:
        return add_paper_to_folder(folder_id, request.paper_id)
    except FolderNotFoundError as exc:
        raise _folder_not_found() from exc
    except PaperNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paper not found",
        ) from exc


@router.delete("/{folder_id}/papers/{paper_id}", response_model=FolderWithPapers)
def remove_folder_paper(folder_id: str, paper_id: str) -> FolderWithPapers:
    try:
        return remove_paper_from_folder(folder_id, paper_id)
    except FolderNotFoundError as exc:
        raise _folder_not_found() from exc


def _folder_not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Folder not found",
    )
