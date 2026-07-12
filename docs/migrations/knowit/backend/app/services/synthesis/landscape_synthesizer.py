from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from typing import Any

from pydantic import ValidationError

from app.models.extractions import PaperExtraction
from app.models.landscapes import Landscape, LandscapeDraft
from app.services.ai_providers.base import BaseAIProvider, ProviderError


LANDSCAPE_SCHEMA: Mapping[str, Any] = {
    "type": "object",
    "required": [
        "overview",
        "clusters",
        "relationships",
        "tensions",
        "open_problems",
        "recommended_reading_path",
    ],
    "properties": {
        "overview": {"type": "string"},
        "clusters": {"type": "array", "items": {"type": "string"}},
        "relationships": {"type": "array", "items": {"type": "string"}},
        "tensions": {"type": "array", "items": {"type": "string"}},
        "open_problems": {"type": "array", "items": {"type": "string"}},
        "recommended_reading_path": {"type": "array", "items": {"type": "string"}},
    },
}


def synthesize_landscape(
    run_id: str,
    topic: str,
    extractions: Sequence[PaperExtraction],
    provider: BaseAIProvider,
) -> Landscape:
    prompt = _build_synthesis_prompt(topic=topic, extractions=extractions)
    try:
        raw_output = provider.generate_json(
            prompt=prompt,
            schema=LANDSCAPE_SCHEMA,
            options={"task": "landscape_synthesis"},
        )
        draft = LandscapeDraft.model_validate(raw_output)
    except (ProviderError, ValidationError, TypeError, ValueError) as exc:
        draft = _fallback_landscape(topic=topic, extractions=extractions, reason=str(exc))

    return Landscape(
        run_id=run_id,
        provider_name=provider.name,
        created_at=datetime.now(timezone.utc),
        **draft.model_dump(),
    )


def _build_synthesis_prompt(
    topic: str,
    extractions: Sequence[PaperExtraction],
) -> str:
    notes = "\n\n".join(
        (
            f"Paper ID: {extraction.paper_id}\n"
            f"Problem: {extraction.problem}\n"
            f"Method: {extraction.method}\n"
            f"Contribution: {extraction.main_contribution}\n"
            f"Key results: {'; '.join(extraction.key_results)}\n"
            f"Limitations: {'; '.join(extraction.limitations)}\n"
            f"Tags: {', '.join(extraction.tags)}"
        )
        for extraction in extractions
    )
    return f"""Synthesize a research landscape for this topic.

Use only the structured paper notes below. Return JSON matching the requested schema.

Topic: {topic}

Paper notes:
{notes}
"""


def _fallback_landscape(
    topic: str,
    extractions: Sequence[PaperExtraction],
    reason: str,
) -> LandscapeDraft:
    paper_ids = [extraction.paper_id for extraction in extractions]
    return LandscapeDraft(
        overview=f"Fallback landscape for {topic} based on {len(extractions)} extracted notes.",
        clusters=["Structured synthesis unavailable; inspect individual paper notes."],
        relationships=["Provider output was missing, malformed, or failed schema validation."],
        tensions=[reason[:220]],
        open_problems=["Run synthesis again with a stronger or better-configured provider."],
        recommended_reading_path=paper_ids,
    )
