import json
import sqlite3
from collections.abc import Sequence
from datetime import datetime, timezone
from pathlib import Path

from app.models.ai_providers import ProviderSetting
from app.models.extractions import PaperExtraction
from app.models.folders import Folder, FolderWithPapers, FolderPaper
from app.models.landscapes import Landscape
from app.models.papers import Paper, RankedPaper
from app.models.runs import ResearchRun, RunStatus
from app.services.ai_providers.base import BaseAIProvider
from app.storage.database import get_connection


class RunNotFoundError(ValueError):
    """Raised when a repository operation targets a missing research run."""


class FolderNotFoundError(ValueError):
    """Raised when a repository operation targets a missing folder."""


class PaperNotFoundError(ValueError):
    """Raised when a repository operation targets a missing paper."""


def save_run(run: ResearchRun, db_path: str | Path | None = None) -> None:
    with get_connection(db_path) as connection:
        connection.execute(
            """
            INSERT INTO runs (
                run_id, topic, status, current_stage, created_at, updated_at, error_message
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET
                topic = excluded.topic,
                status = excluded.status,
                current_stage = excluded.current_stage,
                updated_at = excluded.updated_at,
                error_message = excluded.error_message
            """,
            (
                run.run_id,
                run.topic,
                run.status.value,
                run.current_stage.value,
                _datetime_to_text(run.created_at),
                _datetime_to_text(run.updated_at),
                run.error_message,
            ),
        )


def get_run_by_id(run_id: str, db_path: str | Path | None = None) -> ResearchRun | None:
    with get_connection(db_path) as connection:
        row = connection.execute(
            "SELECT * FROM runs WHERE run_id = ?",
            (run_id,),
        ).fetchone()

    if row is None:
        return None

    return ResearchRun.model_validate(dict(row))


def update_run_status(
    run_id: str,
    status: RunStatus,
    current_stage: RunStatus,
    error_message: str | None = None,
    db_path: str | Path | None = None,
) -> None:
    now = datetime.now(timezone.utc)
    with get_connection(db_path) as connection:
        cursor = connection.execute(
            """
            UPDATE runs
            SET status = ?, current_stage = ?, updated_at = ?, error_message = ?
            WHERE run_id = ?
            """,
            (
                status.value,
                current_stage.value,
                _datetime_to_text(now),
                error_message,
                run_id,
            ),
        )
        if cursor.rowcount == 0:
            raise RunNotFoundError(f"Run '{run_id}' does not exist")


def save_papers(papers: Sequence[Paper], db_path: str | Path | None = None) -> None:
    with get_connection(db_path) as connection:
        for paper in papers:
            connection.execute(
                """
                INSERT INTO papers (
                    paper_id, source, source_id, title, authors_json, abstract,
                    doi, published_date, updated_date, paper_url, pdf_url,
                    categories_json, citation_count, reference_count
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(source, source_id) DO UPDATE SET
                    title = excluded.title,
                    authors_json = excluded.authors_json,
                    abstract = excluded.abstract,
                    doi = excluded.doi,
                    published_date = excluded.published_date,
                    updated_date = excluded.updated_date,
                    paper_url = excluded.paper_url,
                    pdf_url = excluded.pdf_url,
                    categories_json = excluded.categories_json,
                    citation_count = excluded.citation_count,
                    reference_count = excluded.reference_count
                """,
                _paper_values(paper),
            )


def save_ranked_papers(
    run_id: str,
    ranked_papers: Sequence[RankedPaper],
    db_path: str | Path | None = None,
) -> None:
    if get_run_by_id(run_id, db_path) is None:
        raise RunNotFoundError(f"Run '{run_id}' does not exist")

    papers = [ranked_paper.paper for ranked_paper in ranked_papers]
    save_papers(papers, db_path)

    with get_connection(db_path) as connection:
        for ranked_paper in ranked_papers:
            connection.execute(
                """
                INSERT INTO run_papers (
                    run_id, paper_id, rank_position, relevance_score,
                    ranking_method, ranking_explanation
                )
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(run_id, paper_id) DO UPDATE SET
                    rank_position = excluded.rank_position,
                    relevance_score = excluded.relevance_score,
                    ranking_method = excluded.ranking_method,
                    ranking_explanation = excluded.ranking_explanation
                """,
                (
                    run_id,
                    ranked_paper.paper.paper_id,
                    ranked_paper.rank_position,
                    ranked_paper.relevance_score,
                    ranked_paper.ranking_method,
                    ranked_paper.ranking_explanation,
                ),
            )


def get_ranked_papers_for_run(
    run_id: str,
    db_path: str | Path | None = None,
) -> list[RankedPaper]:
    with get_connection(db_path) as connection:
        rows = connection.execute(
            """
            SELECT
                p.*,
                rp.rank_position,
                rp.relevance_score,
                rp.ranking_method,
                rp.ranking_explanation
            FROM run_papers rp
            JOIN papers p ON p.paper_id = rp.paper_id
            WHERE rp.run_id = ?
            ORDER BY rp.rank_position ASC
            """,
            (run_id,),
        ).fetchall()

    return [_ranked_paper_from_row(row) for row in rows]


def save_folder(folder: Folder, db_path: str | Path | None = None) -> None:
    with get_connection(db_path) as connection:
        connection.execute(
            """
            INSERT INTO folders (folder_id, name, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(folder_id) DO UPDATE SET
                name = excluded.name,
                updated_at = excluded.updated_at
            """,
            (
                folder.folder_id,
                folder.name,
                _datetime_to_text(folder.created_at),
                _datetime_to_text(folder.updated_at),
            ),
        )


def get_folders(db_path: str | Path | None = None) -> list[Folder]:
    with get_connection(db_path) as connection:
        rows = connection.execute(
            """
            SELECT
                f.folder_id,
                f.name,
                f.created_at,
                f.updated_at,
                COUNT(fp.paper_id) AS paper_count
            FROM folders f
            LEFT JOIN folder_papers fp ON fp.folder_id = f.folder_id
            GROUP BY f.folder_id
            ORDER BY f.updated_at DESC, f.name ASC
            """
        ).fetchall()

    return [_folder_from_row(row) for row in rows]


def get_folder_by_id(
    folder_id: str,
    db_path: str | Path | None = None,
) -> Folder | None:
    with get_connection(db_path) as connection:
        row = connection.execute(
            """
            SELECT
                f.folder_id,
                f.name,
                f.created_at,
                f.updated_at,
                COUNT(fp.paper_id) AS paper_count
            FROM folders f
            LEFT JOIN folder_papers fp ON fp.folder_id = f.folder_id
            WHERE f.folder_id = ?
            GROUP BY f.folder_id
            """,
            (folder_id,),
        ).fetchone()

    if row is None:
        return None

    return _folder_from_row(row)


def get_folder_with_papers(
    folder_id: str,
    db_path: str | Path | None = None,
) -> FolderWithPapers | None:
    folder = get_folder_by_id(folder_id, db_path)
    if folder is None:
        return None

    with get_connection(db_path) as connection:
        rows = connection.execute(
            """
            SELECT p.*, fp.added_at
            FROM folder_papers fp
            JOIN papers p ON p.paper_id = fp.paper_id
            WHERE fp.folder_id = ?
            ORDER BY fp.added_at DESC, p.title ASC
            """,
            (folder_id,),
        ).fetchall()

    return FolderWithPapers(
        folder=folder,
        papers=[
            FolderPaper(paper=_paper_from_row(row), added_at=row["added_at"])
            for row in rows
        ],
    )


def rename_folder(
    folder_id: str,
    name: str,
    db_path: str | Path | None = None,
) -> Folder:
    now = datetime.now(timezone.utc)
    with get_connection(db_path) as connection:
        cursor = connection.execute(
            """
            UPDATE folders
            SET name = ?, updated_at = ?
            WHERE folder_id = ?
            """,
            (name, _datetime_to_text(now), folder_id),
        )
        if cursor.rowcount == 0:
            raise FolderNotFoundError(f"Folder '{folder_id}' does not exist")

    folder = get_folder_by_id(folder_id, db_path)
    if folder is None:
        raise FolderNotFoundError(f"Folder '{folder_id}' does not exist")
    return folder


def delete_folder(folder_id: str, db_path: str | Path | None = None) -> None:
    with get_connection(db_path) as connection:
        cursor = connection.execute(
            "DELETE FROM folders WHERE folder_id = ?",
            (folder_id,),
        )
        if cursor.rowcount == 0:
            raise FolderNotFoundError(f"Folder '{folder_id}' does not exist")


def add_paper_to_folder(
    folder_id: str,
    paper_id: str,
    db_path: str | Path | None = None,
) -> FolderWithPapers:
    now = datetime.now(timezone.utc)
    with get_connection(db_path) as connection:
        _ensure_folder_exists(connection, folder_id)
        _ensure_paper_exists(connection, paper_id)
        connection.execute(
            """
            INSERT INTO folder_papers (folder_id, paper_id, added_at)
            VALUES (?, ?, ?)
            ON CONFLICT(folder_id, paper_id) DO NOTHING
            """,
            (folder_id, paper_id, _datetime_to_text(now)),
        )
        connection.execute(
            "UPDATE folders SET updated_at = ? WHERE folder_id = ?",
            (_datetime_to_text(now), folder_id),
        )

    folder_with_papers = get_folder_with_papers(folder_id, db_path)
    if folder_with_papers is None:
        raise FolderNotFoundError(f"Folder '{folder_id}' does not exist")
    return folder_with_papers


def remove_paper_from_folder(
    folder_id: str,
    paper_id: str,
    db_path: str | Path | None = None,
) -> FolderWithPapers:
    now = datetime.now(timezone.utc)
    with get_connection(db_path) as connection:
        _ensure_folder_exists(connection, folder_id)
        connection.execute(
            """
            DELETE FROM folder_papers
            WHERE folder_id = ? AND paper_id = ?
            """,
            (folder_id, paper_id),
        )
        connection.execute(
            "UPDATE folders SET updated_at = ? WHERE folder_id = ?",
            (_datetime_to_text(now), folder_id),
        )

    folder_with_papers = get_folder_with_papers(folder_id, db_path)
    if folder_with_papers is None:
        raise FolderNotFoundError(f"Folder '{folder_id}' does not exist")
    return folder_with_papers


def save_paper_extractions(
    extractions: Sequence[PaperExtraction],
    db_path: str | Path | None = None,
) -> None:
    with get_connection(db_path) as connection:
        for extraction in extractions:
            connection.execute(
                """
                INSERT INTO paper_extractions (
                    run_id, paper_id, provider_name, problem, method,
                    datasets_or_setting, key_results_json, main_contribution,
                    limitations_json, tags_json, confidence,
                    source_quote_or_evidence, has_full_text, full_text_status,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(run_id, paper_id) DO UPDATE SET
                    provider_name = excluded.provider_name,
                    problem = excluded.problem,
                    method = excluded.method,
                    datasets_or_setting = excluded.datasets_or_setting,
                    key_results_json = excluded.key_results_json,
                    main_contribution = excluded.main_contribution,
                    limitations_json = excluded.limitations_json,
                    tags_json = excluded.tags_json,
                    confidence = excluded.confidence,
                    source_quote_or_evidence = excluded.source_quote_or_evidence,
                    has_full_text = excluded.has_full_text,
                    full_text_status = excluded.full_text_status,
                    created_at = excluded.created_at
                """,
                (
                    extraction.run_id,
                    extraction.paper_id,
                    extraction.provider_name,
                    extraction.problem,
                    extraction.method,
                    extraction.datasets_or_setting,
                    json.dumps(extraction.key_results),
                    extraction.main_contribution,
                    json.dumps(extraction.limitations),
                    json.dumps(extraction.tags),
                    extraction.confidence,
                    extraction.source_quote_or_evidence,
                    1 if extraction.has_full_text else 0,
                    extraction.full_text_status,
                    _datetime_to_text(extraction.created_at),
                ),
            )


def get_extractions_for_run(
    run_id: str,
    db_path: str | Path | None = None,
) -> list[PaperExtraction]:
    with get_connection(db_path) as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM paper_extractions
            WHERE run_id = ?
            ORDER BY created_at ASC, paper_id ASC
            """,
            (run_id,),
        ).fetchall()

    return [_extraction_from_row(row) for row in rows]


def save_landscape(
    landscape: Landscape,
    db_path: str | Path | None = None,
) -> None:
    with get_connection(db_path) as connection:
        connection.execute(
            """
            INSERT INTO landscapes (
                run_id, provider_name, overview, clusters_json, relationships_json,
                tensions_json, open_problems_json, recommended_reading_path_json,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET
                provider_name = excluded.provider_name,
                overview = excluded.overview,
                clusters_json = excluded.clusters_json,
                relationships_json = excluded.relationships_json,
                tensions_json = excluded.tensions_json,
                open_problems_json = excluded.open_problems_json,
                recommended_reading_path_json = excluded.recommended_reading_path_json,
                created_at = excluded.created_at
            """,
            (
                landscape.run_id,
                landscape.provider_name,
                landscape.overview,
                json.dumps(landscape.clusters),
                json.dumps(landscape.relationships),
                json.dumps(landscape.tensions),
                json.dumps(landscape.open_problems),
                json.dumps(landscape.recommended_reading_path),
                _datetime_to_text(landscape.created_at),
            ),
        )


def get_landscape_for_run(
    run_id: str,
    db_path: str | Path | None = None,
) -> Landscape | None:
    with get_connection(db_path) as connection:
        row = connection.execute(
            "SELECT * FROM landscapes WHERE run_id = ?",
            (run_id,),
        ).fetchone()

    if row is None:
        return None

    return _landscape_from_row(row)


def sync_provider_settings(
    providers: Sequence[BaseAIProvider],
    db_path: str | Path | None = None,
) -> None:
    now = datetime.now(timezone.utc)
    with get_connection(db_path) as connection:
        for provider in providers:
            info = provider.info()
            base_url = getattr(provider, "base_url", None)
            model_name = getattr(provider, "default_model", None)
            connection.execute(
                """
                INSERT INTO ai_provider_settings (
                    provider_name, provider_type, base_url, model_name,
                    api_key_reference, max_context_tokens, enabled, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(provider_name) DO UPDATE SET
                    provider_type = excluded.provider_type,
                    base_url = excluded.base_url,
                    model_name = excluded.model_name,
                    enabled = excluded.enabled,
                    updated_at = excluded.updated_at
                """,
                (
                    info.name,
                    info.provider_type,
                    base_url,
                    model_name,
                    None,
                    None,
                    1 if info.enabled else 0,
                    _datetime_to_text(now),
                ),
            )


def list_provider_settings(db_path: str | Path | None = None) -> list[ProviderSetting]:
    with get_connection(db_path) as connection:
        rows = connection.execute(
            """
            SELECT
                provider_name, provider_type, base_url, model_name,
                api_key_reference, max_context_tokens, enabled, updated_at
            FROM ai_provider_settings
            ORDER BY provider_name ASC
            """
        ).fetchall()

    return [
        ProviderSetting(
            provider_name=row["provider_name"],
            provider_type=row["provider_type"],
            base_url=row["base_url"],
            model_name=row["model_name"],
            api_key_reference=row["api_key_reference"],
            max_context_tokens=row["max_context_tokens"],
            enabled=bool(row["enabled"]),
            updated_at=row["updated_at"],
        )
        for row in rows
    ]


def count_papers(db_path: str | Path | None = None) -> int:
    with get_connection(db_path) as connection:
        row = connection.execute("SELECT COUNT(*) AS count FROM papers").fetchone()

    return int(row["count"])


def count_extractions(db_path: str | Path | None = None) -> int:
    with get_connection(db_path) as connection:
        row = connection.execute(
            "SELECT COUNT(*) AS count FROM paper_extractions"
        ).fetchone()

    return int(row["count"])


def count_landscapes(db_path: str | Path | None = None) -> int:
    with get_connection(db_path) as connection:
        row = connection.execute("SELECT COUNT(*) AS count FROM landscapes").fetchone()

    return int(row["count"])


def _paper_values(
    paper: Paper,
) -> tuple[
    str,
    str,
    str,
    str,
    str,
    str,
    str | None,
    str | None,
    str | None,
    str,
    str | None,
    str,
    int | None,
    int | None,
]:
    return (
        paper.paper_id,
        paper.source,
        paper.source_id,
        paper.title,
        json.dumps(paper.authors),
        paper.abstract,
        paper.doi,
        _optional_datetime_to_text(paper.published_date),
        _optional_datetime_to_text(paper.updated_date),
        paper.paper_url,
        paper.pdf_url,
        json.dumps(paper.categories),
        paper.citation_count,
        paper.reference_count,
    )


def _ranked_paper_from_row(row: sqlite3.Row) -> RankedPaper:
    paper = _paper_from_row(row)
    return RankedPaper(
        paper=paper,
        rank_position=row["rank_position"],
        relevance_score=row["relevance_score"],
        ranking_method=row["ranking_method"],
        ranking_explanation=row["ranking_explanation"],
    )


def _paper_from_row(row: sqlite3.Row) -> Paper:
    return Paper(
        paper_id=row["paper_id"],
        source=row["source"],
        source_id=row["source_id"],
        title=row["title"],
        authors=json.loads(row["authors_json"]),
        abstract=row["abstract"],
        doi=row["doi"],
        published_date=row["published_date"],
        updated_date=row["updated_date"],
        paper_url=row["paper_url"],
        pdf_url=row["pdf_url"],
        categories=json.loads(row["categories_json"]),
        citation_count=row["citation_count"],
        reference_count=row["reference_count"],
    )


def _folder_from_row(row: sqlite3.Row) -> Folder:
    return Folder(
        folder_id=row["folder_id"],
        name=row["name"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        paper_count=row["paper_count"],
    )


def _extraction_from_row(row: sqlite3.Row) -> PaperExtraction:
    return PaperExtraction(
        run_id=row["run_id"],
        paper_id=row["paper_id"],
        provider_name=row["provider_name"],
        problem=row["problem"],
        method=row["method"],
        datasets_or_setting=row["datasets_or_setting"],
        key_results=json.loads(row["key_results_json"]),
        main_contribution=row["main_contribution"],
        limitations=json.loads(row["limitations_json"]),
        tags=json.loads(row["tags_json"]),
        confidence=row["confidence"],
        source_quote_or_evidence=row["source_quote_or_evidence"],
        has_full_text=bool(row["has_full_text"]),
        full_text_status=row["full_text_status"],
        created_at=row["created_at"],
    )


def _landscape_from_row(row: sqlite3.Row) -> Landscape:
    return Landscape(
        run_id=row["run_id"],
        provider_name=row["provider_name"],
        overview=row["overview"],
        clusters=json.loads(row["clusters_json"]),
        relationships=json.loads(row["relationships_json"]),
        tensions=json.loads(row["tensions_json"]),
        open_problems=json.loads(row["open_problems_json"]),
        recommended_reading_path=json.loads(row["recommended_reading_path_json"]),
        created_at=row["created_at"],
    )


def _optional_datetime_to_text(value: datetime | None) -> str | None:
    if value is None:
        return None

    return _datetime_to_text(value)


def _datetime_to_text(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def _ensure_folder_exists(connection: sqlite3.Connection, folder_id: str) -> None:
    row = connection.execute(
        "SELECT 1 FROM folders WHERE folder_id = ?",
        (folder_id,),
    ).fetchone()
    if row is None:
        raise FolderNotFoundError(f"Folder '{folder_id}' does not exist")


def _ensure_paper_exists(connection: sqlite3.Connection, paper_id: str) -> None:
    row = connection.execute(
        "SELECT 1 FROM papers WHERE paper_id = ?",
        (paper_id,),
    ).fetchone()
    if row is None:
        raise PaperNotFoundError(f"Paper '{paper_id}' does not exist")
