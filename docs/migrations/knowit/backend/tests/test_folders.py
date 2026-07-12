import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from app.models.folders import Folder
from app.models.papers import Paper, RankedPaper
from app.models.runs import ResearchRun, RunStatus
from app.storage.database import init_database
from app.storage.repositories import (
    FolderNotFoundError,
    PaperNotFoundError,
    add_paper_to_folder,
    count_papers,
    delete_folder,
    get_folder_with_papers,
    get_folders,
    remove_paper_from_folder,
    rename_folder,
    save_folder,
    save_ranked_papers,
    save_run,
)


def run() -> ResearchRun:
    now = datetime.now(timezone.utc)
    return ResearchRun(
        run_id="run-1",
        topic="retrieval augmented generation",
        status=RunStatus.CREATED,
        current_stage=RunStatus.CREATED,
        created_at=now,
        updated_at=now,
    )


def folder(folder_id: str = "folder-1", name: str = "RAG Papers") -> Folder:
    now = datetime.now(timezone.utc)
    return Folder(
        folder_id=folder_id,
        name=name,
        created_at=now,
        updated_at=now,
    )


def paper(paper_id: str = "arxiv:1234.5678v1") -> Paper:
    return Paper(
        paper_id=paper_id,
        source="arxiv",
        source_id=paper_id.replace("arxiv:", ""),
        title="Retrieval Augmented Generation",
        authors=["Ada Lovelace"],
        abstract="A paper about retrieval augmented generation.",
        doi="10.1000/rag",
        paper_url="https://arxiv.org/abs/1234.5678v1",
        pdf_url="https://arxiv.org/pdf/1234.5678v1",
        categories=["cs.CL"],
        citation_count=12,
        reference_count=34,
    )


def ranked_paper(expected_paper: Paper) -> RankedPaper:
    return RankedPaper(
        paper=expected_paper,
        rank_position=1,
        relevance_score=10.0,
        ranking_method="keyword_v1",
        ranking_explanation="title term matches: 3",
    )


class FolderStorageTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test.sqlite3"
        init_database(self.db_path)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_folder_crud_and_paper_membership(self) -> None:
        expected_run = run()
        expected_folder = folder()
        expected_paper = paper()
        save_run(expected_run, self.db_path)
        save_ranked_papers(
            expected_run.run_id,
            [ranked_paper(expected_paper)],
            self.db_path,
        )

        save_folder(expected_folder, self.db_path)
        stored_folders = get_folders(self.db_path)
        self.assertEqual(len(stored_folders), 1)
        self.assertEqual(stored_folders[0].name, "RAG Papers")
        self.assertEqual(stored_folders[0].paper_count, 0)

        folder_with_papers = add_paper_to_folder(
            expected_folder.folder_id,
            expected_paper.paper_id,
            self.db_path,
        )
        self.assertEqual(folder_with_papers.folder.paper_count, 1)
        self.assertEqual(len(folder_with_papers.papers), 1)
        self.assertEqual(folder_with_papers.papers[0].paper.paper_id, expected_paper.paper_id)

        add_paper_to_folder(
            expected_folder.folder_id,
            expected_paper.paper_id,
            self.db_path,
        )
        self.assertEqual(
            get_folder_with_papers(expected_folder.folder_id, self.db_path).folder.paper_count,
            1,
        )

        renamed_folder = rename_folder(
            expected_folder.folder_id,
            "Grounded Generation",
            self.db_path,
        )
        self.assertEqual(renamed_folder.name, "Grounded Generation")

        without_paper = remove_paper_from_folder(
            expected_folder.folder_id,
            expected_paper.paper_id,
            self.db_path,
        )
        self.assertEqual(without_paper.folder.paper_count, 0)
        self.assertEqual(count_papers(self.db_path), 1)

        add_paper_to_folder(
            expected_folder.folder_id,
            expected_paper.paper_id,
            self.db_path,
        )
        delete_folder(expected_folder.folder_id, self.db_path)
        self.assertEqual(get_folders(self.db_path), [])
        self.assertEqual(count_papers(self.db_path), 1)

    def test_paper_can_be_added_to_multiple_folders(self) -> None:
        expected_run = run()
        expected_paper = paper()
        save_run(expected_run, self.db_path)
        save_ranked_papers(
            expected_run.run_id,
            [ranked_paper(expected_paper)],
            self.db_path,
        )
        first_folder = folder("folder-1", "RAG Papers")
        second_folder = folder("folder-2", "Reading List")
        save_folder(first_folder, self.db_path)
        save_folder(second_folder, self.db_path)

        first = add_paper_to_folder(
            first_folder.folder_id,
            expected_paper.paper_id,
            self.db_path,
        )
        second = add_paper_to_folder(
            second_folder.folder_id,
            expected_paper.paper_id,
            self.db_path,
        )

        self.assertEqual(first.folder.paper_count, 1)
        self.assertEqual(second.folder.paper_count, 1)
        self.assertEqual(count_papers(self.db_path), 1)

    def test_add_paper_to_folder_raises_for_missing_records(self) -> None:
        save_folder(folder(), self.db_path)

        with self.assertRaises(PaperNotFoundError):
            add_paper_to_folder("folder-1", "missing-paper", self.db_path)

        with self.assertRaises(FolderNotFoundError):
            add_paper_to_folder("missing-folder", "missing-paper", self.db_path)


if __name__ == "__main__":
    unittest.main()
