import os
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

DEFAULT_DATABASE_PATH = (
    Path(__file__).resolve().parents[2] / "data" / "research_field_mapper.sqlite3"
)


def database_path() -> Path:
    configured_path = os.getenv("RFM_DATABASE_PATH")
    if configured_path:
        return Path(configured_path).expanduser()

    return DEFAULT_DATABASE_PATH


@contextmanager
def get_connection(db_path: str | Path | None = None) -> Iterator[sqlite3.Connection]:
    path = Path(db_path) if db_path is not None else database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def init_database(db_path: str | Path | None = None) -> None:
    with get_connection(db_path) as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS runs (
                run_id TEXT PRIMARY KEY,
                topic TEXT NOT NULL,
                status TEXT NOT NULL,
                current_stage TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                error_message TEXT
            );

            CREATE TABLE IF NOT EXISTS papers (
                paper_id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                source_id TEXT NOT NULL,
                title TEXT NOT NULL,
                authors_json TEXT NOT NULL,
                abstract TEXT NOT NULL,
                doi TEXT,
                published_date TEXT,
                updated_date TEXT,
                paper_url TEXT NOT NULL,
                pdf_url TEXT,
                categories_json TEXT NOT NULL,
                citation_count INTEGER,
                reference_count INTEGER,
                UNIQUE(source, source_id)
            );

            CREATE TABLE IF NOT EXISTS run_papers (
                run_id TEXT NOT NULL,
                paper_id TEXT NOT NULL,
                rank_position INTEGER NOT NULL,
                relevance_score REAL NOT NULL,
                ranking_method TEXT NOT NULL,
                ranking_explanation TEXT NOT NULL,
                PRIMARY KEY (run_id, paper_id),
                FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE,
                FOREIGN KEY (paper_id) REFERENCES papers(paper_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS folders (
                folder_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS folder_papers (
                folder_id TEXT NOT NULL,
                paper_id TEXT NOT NULL,
                added_at TEXT NOT NULL,
                PRIMARY KEY (folder_id, paper_id),
                FOREIGN KEY (folder_id) REFERENCES folders(folder_id) ON DELETE CASCADE,
                FOREIGN KEY (paper_id) REFERENCES papers(paper_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS ai_provider_settings (
                provider_name TEXT PRIMARY KEY,
                provider_type TEXT NOT NULL,
                base_url TEXT,
                model_name TEXT,
                api_key_reference TEXT,
                max_context_tokens INTEGER,
                enabled INTEGER NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS paper_extractions (
                            run_id TEXT NOT NULL,
                            paper_id TEXT NOT NULL,
                            provider_name TEXT NOT NULL,
                            problem TEXT NOT NULL,
                            method TEXT NOT NULL,
                            datasets_or_setting TEXT NOT NULL,
                            key_results_json TEXT NOT NULL,
                            main_contribution TEXT NOT NULL,
                            limitations_json TEXT NOT NULL,
                            tags_json TEXT NOT NULL,
                            confidence REAL NOT NULL,
                            source_quote_or_evidence TEXT NOT NULL,
                            has_full_text INTEGER NOT NULL DEFAULT 0,
                            full_text_status TEXT NOT NULL DEFAULT 'abstract_only',
                            created_at TEXT NOT NULL,
                            PRIMARY KEY (run_id, paper_id),
                            FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE,
                            FOREIGN KEY (paper_id) REFERENCES papers(paper_id) ON DELETE CASCADE
                        );

            CREATE TABLE IF NOT EXISTS landscapes (
                run_id TEXT PRIMARY KEY,
                provider_name TEXT NOT NULL,
                overview TEXT NOT NULL,
                clusters_json TEXT NOT NULL,
                relationships_json TEXT NOT NULL,
                tensions_json TEXT NOT NULL,
                open_problems_json TEXT NOT NULL,
                recommended_reading_path_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE
            );
            """
        )
        _ensure_column(connection, "papers", "doi", "TEXT")
        _ensure_column(connection, "papers", "citation_count", "INTEGER")
        _ensure_column(connection, "papers", "reference_count", "INTEGER")
        _ensure_column(
            connection,
            "paper_extractions",
            "has_full_text",
            "INTEGER NOT NULL DEFAULT 0",
        )
        _ensure_column(
            connection,
            "paper_extractions",
            "full_text_status",
            "TEXT NOT NULL DEFAULT 'abstract_only'",
        )


def _ensure_column(
    connection: sqlite3.Connection,
    table_name: str,
    column_name: str,
    column_definition: str,
) -> None:
    columns = {
        row["name"]
        for row in connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    }
    if column_name in columns:
        return

    connection.execute(
        f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_definition}"
    )
