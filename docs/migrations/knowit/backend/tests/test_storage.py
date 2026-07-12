import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from app.models.extractions import PaperExtraction
from app.models.landscapes import Landscape
from app.models.papers import Paper, RankedPaper
from app.models.runs import ResearchRun, RunStatus
from app.services.ai_providers.registry import list_providers
from app.storage.database import init_database
from app.storage.repositories import (
    RunNotFoundError,
    count_papers,
    count_extractions,
    count_landscapes,
    get_extractions_for_run,
    get_landscape_for_run,
    get_ranked_papers_for_run,
    get_run_by_id,
    list_provider_settings,
    save_paper_extractions,
    save_landscape,
    save_ranked_papers,
    save_run,
    sync_provider_settings,
    update_run_status,
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


def paper() -> Paper:
    return Paper(
        paper_id="arxiv:1234.5678v1",
        source="arxiv",
        source_id="1234.5678v1",
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


class StorageTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test.sqlite3"
        init_database(self.db_path)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_run_persists_across_connections(self) -> None:
        expected_run = run()
        save_run(expected_run, self.db_path)

        stored_run = get_run_by_id(expected_run.run_id, self.db_path)

        self.assertIsNotNone(stored_run)
        self.assertEqual(stored_run.topic, expected_run.topic)
        self.assertEqual(stored_run.status, RunStatus.CREATED)

    def test_ranked_papers_are_deduplicated_by_source_id(self) -> None:
        expected_run = run()
        expected_paper = paper()
        ranked_paper = RankedPaper(
            paper=expected_paper,
            rank_position=1,
            relevance_score=10.0,
            ranking_method="keyword_v1",
            ranking_explanation="title term matches: 3",
        )
        save_run(expected_run, self.db_path)

        save_ranked_papers(expected_run.run_id, [ranked_paper], self.db_path)
        save_ranked_papers(expected_run.run_id, [ranked_paper], self.db_path)

        stored_ranked_papers = get_ranked_papers_for_run(
            expected_run.run_id,
            self.db_path,
        )
        self.assertEqual(count_papers(self.db_path), 1)
        self.assertEqual(len(stored_ranked_papers), 1)
        self.assertEqual(stored_ranked_papers[0].paper.source_id, "1234.5678v1")
        self.assertEqual(stored_ranked_papers[0].paper.doi, "10.1000/rag")
        self.assertEqual(stored_ranked_papers[0].paper.citation_count, 12)
        self.assertEqual(stored_ranked_papers[0].paper.reference_count, 34)

    def test_save_ranked_papers_raises_run_not_found_for_missing_run(self) -> None:
        ranked_paper = RankedPaper(
            paper=paper(),
            rank_position=1,
            relevance_score=10.0,
            ranking_method="keyword_v1",
            ranking_explanation="title term matches: 3",
        )

        with self.assertRaises(RunNotFoundError):
            save_ranked_papers("missing-run", [ranked_paper], self.db_path)

        self.assertEqual(count_papers(self.db_path), 0)

    def test_update_run_status_raises_run_not_found_for_missing_run(self) -> None:
        with self.assertRaises(RunNotFoundError):
            update_run_status(
                run_id="missing-run",
                status=RunStatus.SEARCHING,
                current_stage=RunStatus.SEARCHING,
                db_path=self.db_path,
            )

    def test_provider_settings_can_be_seeded_and_read(self) -> None:
        sync_provider_settings(list_providers(), self.db_path)

        settings = list_provider_settings(self.db_path)
        provider_names = {setting.provider_name for setting in settings}

        self.assertIn("mock", provider_names)
        self.assertIn("ollama", provider_names)

    def test_paper_extractions_can_be_saved_and_read(self) -> None:
        expected_run = run()
        expected_paper = paper()
        ranked_paper = RankedPaper(
            paper=expected_paper,
            rank_position=1,
            relevance_score=10.0,
            ranking_method="keyword_v1",
            ranking_explanation="title term matches: 3",
        )
        extraction = PaperExtraction(
            run_id=expected_run.run_id,
            paper_id=expected_paper.paper_id,
            provider_name="mock",
            problem="Problem",
            method="Method",
            datasets_or_setting="Dataset",
            key_results=["Result"],
            main_contribution="Contribution",
            limitations=["Limitation"],
            tags=["tag"],
            confidence=0.5,
            source_quote_or_evidence="Evidence",
            has_full_text=True,
            full_text_status="pdf_downloaded",
            created_at=datetime.now(timezone.utc),
        )
        save_run(expected_run, self.db_path)
        save_ranked_papers(expected_run.run_id, [ranked_paper], self.db_path)

        save_paper_extractions([extraction], self.db_path)

        stored_extractions = get_extractions_for_run(expected_run.run_id, self.db_path)
        self.assertEqual(count_extractions(self.db_path), 1)
        self.assertEqual(len(stored_extractions), 1)
        self.assertEqual(stored_extractions[0].problem, "Problem")
        self.assertTrue(stored_extractions[0].has_full_text)
        self.assertEqual(stored_extractions[0].full_text_status, "pdf_downloaded")

    def test_landscape_can_be_saved_and_read(self) -> None:
        expected_run = run()
        landscape = Landscape(
            run_id=expected_run.run_id,
            provider_name="mock",
            overview="Overview",
            clusters=["Cluster"],
            relationships=["Relationship"],
            tensions=["Tension"],
            open_problems=["Open problem"],
            recommended_reading_path=["arxiv:1234.5678v1"],
            created_at=datetime.now(timezone.utc),
        )
        save_run(expected_run, self.db_path)

        save_landscape(landscape, self.db_path)

        stored_landscape = get_landscape_for_run(expected_run.run_id, self.db_path)
        self.assertEqual(count_landscapes(self.db_path), 1)
        self.assertIsNotNone(stored_landscape)
        self.assertEqual(stored_landscape.overview, "Overview")
        self.assertEqual(stored_landscape.clusters, ["Cluster"])


if __name__ == "__main__":
    unittest.main()
