from collections.abc import Callable
from pathlib import Path

from app.models.papers import Paper
from app.models.runs import RunStatus
from app.services.ai_providers.registry import get_provider
from app.services.extraction.paper_extractor import extract_paper_notes
from app.services.paper_sources.pdf_fetcher import PdfFetchResult, fetch_pdf_for_paper
from app.services.paper_sources.pdf_parser import (
    ParsedPaperText,
    PdfParsingError,
    parse_pdf_text,
)
from app.services.paper_sources.search import PaperSource, search_papers
from app.services.ranking.rrf_ranker import fuse_ranked_papers
from app.services.ranking.semantic_ranker import rank_papers_semantically
from app.services.ranking.simple_ranker import rank_papers
from app.services.synthesis.landscape_synthesizer import synthesize_landscape
from app.storage.repositories import (
    get_run_by_id,
    save_paper_extractions,
    save_landscape,
    save_ranked_papers,
    update_run_status,
)


PaperSearchFn = Callable[[str, int, PaperSource], list[Paper]]
PdfFetchFn = Callable[[Paper], PdfFetchResult]
PdfParseFn = Callable[[bytes], ParsedPaperText]


def run_research_pipeline(
    run_id: str,
    max_results: int = 10,
    provider_name: str = "mock",
    paper_source: PaperSource = "arxiv",
    db_path: str | Path | None = None,
    paper_search: PaperSearchFn = search_papers,
    pdf_fetcher: PdfFetchFn = fetch_pdf_for_paper,
    pdf_parser: PdfParseFn = parse_pdf_text,
) -> None:
    run = get_run_by_id(run_id, db_path)
    if run is None:
        return

    try:
        update_run_status(
            run_id=run_id,
            status=RunStatus.SEARCHING,
            current_stage=RunStatus.SEARCHING,
            db_path=db_path,
        )
        papers = paper_search(run.topic, max_results, paper_source)

        update_run_status(
            run_id=run_id,
            status=RunStatus.RANKING,
            current_stage=RunStatus.RANKING,
            db_path=db_path,
        )
        keyword_ranked_papers = rank_papers(topic=run.topic, papers=papers)

        update_run_status(
            run_id=run_id,
            status=RunStatus.SEMANTIC_RANKING,
            current_stage=RunStatus.SEMANTIC_RANKING,
            db_path=db_path,
        )
        semantic_ranked_papers = rank_papers_semantically(topic=run.topic, papers=papers, provider=get_provider(provider_name))
        ranked_papers = fuse_ranked_papers(
            keyword_ranked=keyword_ranked_papers,
            semantic_ranked=semantic_ranked_papers,
        )
        save_ranked_papers(run_id=run_id, ranked_papers=ranked_papers, db_path=db_path)

        provider = get_provider(provider_name)
        provider_health = provider.health_check()
        if not provider_health.available:
            raise RuntimeError(provider_health.message)

        update_run_status(
            run_id=run_id,
            status=RunStatus.PDF_DOWNLOADING,
            current_stage=RunStatus.PDF_DOWNLOADING,
            db_path=db_path,
        )
        papers_for_extraction = ranked_papers[: min(10, max_results)]
        full_text_by_paper_id: dict[str, ParsedPaperText] = {}
        full_text_status_by_paper_id: dict[str, str] = {}
        for ranked_paper in papers_for_extraction:
            pdf_result = pdf_fetcher(ranked_paper.paper)
            full_text_status_by_paper_id[ranked_paper.paper.paper_id] = pdf_result.status
            if pdf_result.content is None:
                continue
            try:
                parsed_text = pdf_parser(pdf_result.content)
            except PdfParsingError:
                full_text_status_by_paper_id[ranked_paper.paper.paper_id] = (
                    "parsing_failed"
                )
                continue
            if parsed_text.has_extractable_text:
                full_text_by_paper_id[ranked_paper.paper.paper_id] = parsed_text
                full_text_status_by_paper_id[ranked_paper.paper.paper_id] = (
                    "pdf_downloaded"
                )
            else:
                full_text_status_by_paper_id[ranked_paper.paper.paper_id] = (
                    "parsing_failed"
                )

        update_run_status(
            run_id=run_id,
            status=RunStatus.EXTRACTING,
            current_stage=RunStatus.EXTRACTING,
            db_path=db_path,
        )
        extractions = []
        for ranked_paper in papers_for_extraction:
            extraction = extract_paper_notes(
                run_id=run_id,
                paper=ranked_paper.paper,
                provider=provider,
                full_text=full_text_by_paper_id.get(ranked_paper.paper.paper_id),
                full_text_status=full_text_status_by_paper_id.get(
                    ranked_paper.paper.paper_id,
                    "abstract_only",
                ),
            )
            extractions.append(extraction)
            save_paper_extractions([extraction], db_path=db_path)

        update_run_status(
            run_id=run_id,
            status=RunStatus.SYNTHESIZING,
            current_stage=RunStatus.SYNTHESIZING,
            db_path=db_path,
        )
        landscape = synthesize_landscape(
            run_id=run_id,
            topic=run.topic,
            extractions=extractions,
            provider=provider,
        )
        save_landscape(landscape, db_path=db_path)

        update_run_status(
            run_id=run_id,
            status=RunStatus.COMPLETE,
            current_stage=RunStatus.COMPLETE,
            db_path=db_path,
        )
    except Exception as exc:
        update_run_status(
            run_id=run_id,
            status=RunStatus.FAILED,
            current_stage=RunStatus.FAILED,
            error_message=str(exc),
            db_path=db_path,
        )
