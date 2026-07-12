import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from app.models.papers import Paper
from app.models.runs import ResearchRun, RunStatus
import app.pipeline.research_pipeline as research_pipeline
from app.pipeline.research_pipeline import run_research_pipeline
from app.services.paper_sources.pdf_fetcher import PdfFetchResult
from app.services.paper_sources.pdf_parser import ParsedPaperText
from app.services.paper_sources.search import PaperSource
from app.storage.database import init_database
from app.storage.repositories import (
    get_extractions_for_run,
    get_landscape_for_run,
    get_ranked_papers_for_run,
    get_run_by_id,
    save_run,
)


def run() -> ResearchRun:
    now = datetime.now(timezone.utc)
    return ResearchRun(
        run_id="run-pipeline",
        topic="tool using language models",
        status=RunStatus.CREATED,
        current_stage=RunStatus.CREATED,
        created_at=now,
        updated_at=now,
    )


def fake_search(topic: str, max_results: int, source: PaperSource) -> list[Paper]:
    return [
        Paper(
            paper_id="arxiv:0000.0001v1",
            source="arxiv",
            source_id="0000.0001v1",
            title="Tool Using Language Models",
            authors=["Ada Lovelace"],
            abstract=f"{topic} with tools.",
            doi="10.1000/tool-use",
            paper_url="https://arxiv.org/abs/0000.0001v1",
            pdf_url="https://arxiv.org/pdf/0000.0001v1",
            categories=["cs.CL"],
        )
    ][:max_results]


def no_pdf_fetcher(paper: Paper) -> PdfFetchResult:
    return PdfFetchResult(status="no_pdf_available")


class PipelineTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test.sqlite3"
        init_database(self.db_path)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_pipeline_marks_run_complete_and_saves_ranked_papers_and_extractions(self) -> None:
        expected_run = run()
        seen_sources: list[PaperSource] = []
        save_run(expected_run, self.db_path)

        def tracking_search(
            topic: str,
            max_results: int,
            source: PaperSource,
        ) -> list[Paper]:
            seen_sources.append(source)
            return fake_search(topic, max_results, source)

        run_research_pipeline(
            run_id=expected_run.run_id,
            max_results=1,
            paper_source="semantic_scholar",
            db_path=self.db_path,
            paper_search=tracking_search,
            pdf_fetcher=no_pdf_fetcher,
        )

        stored_run = get_run_by_id(expected_run.run_id, self.db_path)
        stored_papers = get_ranked_papers_for_run(expected_run.run_id, self.db_path)
        stored_extractions = get_extractions_for_run(expected_run.run_id, self.db_path)
        stored_landscape = get_landscape_for_run(expected_run.run_id, self.db_path)
        self.assertEqual(stored_run.status, RunStatus.COMPLETE)
        self.assertEqual(stored_run.current_stage, RunStatus.COMPLETE)
        self.assertEqual(len(stored_papers), 1)
        self.assertEqual(stored_papers[0].rank_position, 1)
        self.assertEqual(len(stored_extractions), 1)
        self.assertEqual(stored_extractions[0].provider_name, "mock")
        self.assertFalse(stored_extractions[0].has_full_text)
        self.assertEqual(stored_extractions[0].full_text_status, "no_pdf_available")
        self.assertIsNotNone(stored_landscape)
        self.assertEqual(stored_landscape.provider_name, "mock")
        self.assertEqual(seen_sources, ["semantic_scholar"])

    def test_pipeline_transitions_through_semantic_ranking(self) -> None:
        expected_run = run()
        save_run(expected_run, self.db_path)
        stages: list[RunStatus] = []
        update_run_status = research_pipeline.update_run_status

        def record_stage(*args, **kwargs) -> None:
            stages.append(kwargs["current_stage"])
            update_run_status(*args, **kwargs)

        with patch.object(
            research_pipeline,
            "update_run_status",
            side_effect=record_stage,
        ):
            run_research_pipeline(
                run_id=expected_run.run_id,
                max_results=1,
                db_path=self.db_path,
                paper_search=fake_search,
                pdf_fetcher=no_pdf_fetcher,
            )

        self.assertEqual(
            stages[:6],
            [
                RunStatus.SEARCHING,
                RunStatus.RANKING,
                RunStatus.SEMANTIC_RANKING,
                RunStatus.PDF_DOWNLOADING,
                RunStatus.EXTRACTING,
                RunStatus.SYNTHESIZING,
            ],
        )

    def test_pipeline_uses_parsed_pdf_text_for_extraction(self) -> None:
        expected_run = run()
        save_run(expected_run, self.db_path)

        def pdf_fetcher(paper: Paper) -> PdfFetchResult:
            return PdfFetchResult(status="pdf_downloaded", content=b"%PDF test")

        def pdf_parser(content: bytes) -> ParsedPaperText:
            self.assertEqual(content, b"%PDF test")
            return ParsedPaperText(
                title_page_text="Tool Using Language Models",
                body_text="full body",
                sections={"methods": "The system uses tool APIs."},
                references_text="References are not stored.",
            )

        run_research_pipeline(
            run_id=expected_run.run_id,
            max_results=1,
            db_path=self.db_path,
            paper_search=fake_search,
            pdf_fetcher=pdf_fetcher,
            pdf_parser=pdf_parser,
        )

        stored_extractions = get_extractions_for_run(expected_run.run_id, self.db_path)
        self.assertEqual(len(stored_extractions), 1)
        self.assertTrue(stored_extractions[0].has_full_text)
        self.assertEqual(stored_extractions[0].full_text_status, "pdf_downloaded")
        self.assertIn("full-text", stored_extractions[0].tags)

    def test_pipeline_marks_run_failed_when_stage_raises(self) -> None:
        expected_run = run()
        save_run(expected_run, self.db_path)

        def failing_search(
            topic: str,
            max_results: int,
            source: PaperSource,
        ) -> list[Paper]:
            raise RuntimeError("search failed")

        run_research_pipeline(
            run_id=expected_run.run_id,
            max_results=1,
            db_path=self.db_path,
            paper_search=failing_search,
            pdf_fetcher=no_pdf_fetcher,
        )

        stored_run = get_run_by_id(expected_run.run_id, self.db_path)
        self.assertEqual(stored_run.status, RunStatus.FAILED)
        self.assertEqual(stored_run.current_stage, RunStatus.FAILED)
        self.assertEqual(stored_run.error_message, "search failed")


if __name__ == "__main__":
    unittest.main()
