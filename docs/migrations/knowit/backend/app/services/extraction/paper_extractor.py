from collections.abc import Mapping
from datetime import datetime, timezone
from typing import Any

from pydantic import ValidationError

from app.models.extractions import PaperExtraction, PaperExtractionDraft
from app.models.papers import Paper
from app.services.ai_providers.base import BaseAIProvider, ProviderError
from app.services.paper_sources.pdf_parser import ParsedPaperText, format_sections_for_prompt


EXTRACTION_SCHEMA: Mapping[str, Any] = {
    "type": "object",
    "required": [
        "problem",
        "method",
        "datasets_or_setting",
        "key_results",
        "main_contribution",
        "limitations",
        "tags",
        "confidence",
        "source_quote_or_evidence",
    ],
    "properties": {
        "problem": {"type": "string"},
        "method": {"type": "string"},
        "datasets_or_setting": {"type": "string"},
        "key_results": {"type": "array", "items": {"type": "string"}},
        "main_contribution": {"type": "string"},
        "limitations": {"type": "array", "items": {"type": "string"}},
        "tags": {"type": "array", "items": {"type": "string"}},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "source_quote_or_evidence": {"type": "string"},
    },
}


def extract_paper_notes(
    run_id: str,
    paper: Paper,
    provider: BaseAIProvider,
    full_text: ParsedPaperText | None = None,
    full_text_status: str = "abstract_only",
) -> PaperExtraction:
    has_full_text = full_text is not None and full_text.has_extractable_text
    prompt = _build_extraction_prompt(
        paper=paper,
        full_text=full_text if has_full_text else None,
        max_abstract_chars=getattr(provider, "max_abstract_chars", None),
        max_full_text_section_chars=getattr(
            provider,
            "max_full_text_section_chars",
            None,
        ),
    )
    try:
        raw_output = provider.generate_json(
            prompt=prompt,
            schema=EXTRACTION_SCHEMA,
            options={"task": "paper_extraction"},
        )
        draft = PaperExtractionDraft.model_validate(raw_output).model_copy(
            update={
                "has_full_text": has_full_text,
                "full_text_status": full_text_status,
            }
        )
    except (ProviderError, ValidationError, TypeError, ValueError) as exc:
        draft = _fallback_extraction(
            paper,
            reason=str(exc),
            has_full_text=has_full_text,
            full_text_status=full_text_status,
        )

    return PaperExtraction(
        run_id=run_id,
        paper_id=paper.paper_id,
        provider_name=provider.name,
        created_at=datetime.now(timezone.utc),
        **draft.model_dump(),
    )


def _build_extraction_prompt(
    paper: Paper,
    full_text: ParsedPaperText | None = None,
    max_abstract_chars: int | None = None,
    max_full_text_section_chars: int | None = None,
) -> str:
    authors = ", ".join(paper.authors)
    categories = ", ".join(paper.categories)
    abstract = paper.abstract
    if max_abstract_chars is not None and max_abstract_chars > 0:
        abstract = abstract[:max_abstract_chars]
    if full_text is not None and full_text.has_extractable_text:
        section_char_limit = (
            max_full_text_section_chars
            if max_full_text_section_chars is not None and max_full_text_section_chars > 0
            else 2000
        )
        sections = format_sections_for_prompt(
            full_text,
            max_section_chars=section_char_limit,
        )
        formatted_sections = "\n".join(
            f"{section_name}: {section_text or '[not identified]'}"
            for section_name, section_text in sections.items()
        )
        return f"""Extract structured research notes from this paper.

Use the metadata and parsed PDF sections below. Parsed PDF text may contain extraction noise, so cite only details supported by the supplied text. Return JSON matching the requested schema.

Title: {paper.title}
Authors: {authors}
Categories: {categories}
Abstract: {abstract}

Parsed PDF sections:
{formatted_sections}
"""

    return f"""Extract structured research notes from this paper metadata.

Use only the title and abstract below. Do not invent details from the PDF.
Return JSON matching the requested schema.

Title: {paper.title}
Authors: {authors}
Categories: {categories}
Abstract: {abstract}
"""


def _fallback_extraction(
    paper: Paper,
    reason: str,
    *,
    has_full_text: bool = False,
    full_text_status: str = "abstract_only",
) -> PaperExtractionDraft:
    evidence = paper.abstract[:280] if paper.abstract else paper.title
    return PaperExtractionDraft(
        problem="Could not confidently extract the research problem from provider output.",
        method="Could not confidently extract the method from provider output.",
        datasets_or_setting="Not available from validated provider output.",
        key_results=[],
        main_contribution="Structured extraction fallback generated from metadata only.",
        limitations=[
            "Provider output was missing, malformed, or failed schema validation.",
            reason[:220],
        ],
        tags=[paper.source, *paper.categories[:3]],
        confidence=0.0,
        source_quote_or_evidence=evidence,
        has_full_text=has_full_text,
        full_text_status=full_text_status,
    )
